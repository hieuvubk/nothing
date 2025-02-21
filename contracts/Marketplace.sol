// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./facets/LandPixelFacet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LandPixelMarketplace is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SaleType {
        FixedPrice,
        Auction
    }

    struct Listing {
        SaleType saleType;
        address seller;
        address highestBidder;
        uint256 highestBid;
        uint256 startTime;
        uint256 duration;
        bool active;
        uint256 buyNowPrice;
        address paymentToken; // ETH = address(0)
        uint256 escrowedAmount; // Track escrowed amount for refunds
    }

    struct Offer {
        uint256 offerId;
        address offerer;
        uint256 amount;
        uint256 startTime;
        uint256 duration;
        bool active;
        address paymentToken; // ETH = address(0)
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => mapping(address => Offer)) public offers;
    mapping(address => mapping(address => uint256)) private escrowBalances; // user => token => amount
    mapping(uint256 => uint256) private nextOfferId; // tokenId => offerId

    uint256 public marketplaceFee = 2000; // 20% default fee (in basis points)
    address public landBank;

    // Constants for security limits
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MIN_BID_INCREMENT_BPS = 100; // 1% minimum bid increment
    uint256 public constant MAX_FEE = 5000; // 50% maximum fee (in basis points)

    LandPixelFacet public landPixelContract;

    event ListingCreated(
        uint256 tokenId,
        address seller,
        uint256 startingPrice,
        uint256 buyNowPrice,
        address paymentToken
    );
    event BidPlaced(uint256 tokenId, address bidder, uint256 amount, address paymentToken);
    event OfferMade(uint256 tokenId, address offerer, uint256 amount, address paymentToken);
    event OfferWithdrawn(uint256 indexed tokenId, address indexed offerer, uint256 amount, address paymentToken);
    event SaleFinalized(uint256 tokenId, address buyer, uint256 amount, address paymentToken);
    event FeeUpdated(uint256 newFee);
    event FeesCollected(address token, uint256 amount);
    event Unlisted(uint256 indexed tokenId, address indexed seller);

    modifier validDuration(uint256 duration) {
        require(duration > 0 && duration <= MAX_DURATION, "Invalid duration");
        _;
    }

    modifier validPaymentToken(address token) {
        if (token != address(0)) {
            require(token.code.length > 0, "Invalid token contract");
        }
        _;
    }

    constructor(address initialOwner, address _landPixelAddress, address _landBank) Ownable(initialOwner) {
        landPixelContract = LandPixelFacet(_landPixelAddress);
        landBank = _landBank;
    }

    function listForSale(
        uint256 tokenId,
        uint256 startingPrice,
        SaleType saleType,
        uint256 duration,
        uint256 buyNowPrice,
        address paymentToken
    ) external validDuration(duration) validPaymentToken(paymentToken) {
        require(startingPrice > 0, "Price must be > 0");
        require(landPixelContract.ownerOf(tokenId) == msg.sender, "Not owner");
        require(listings[tokenId].active == false, "Already listed");
        require(
            landPixelContract.isApprovedForAll(msg.sender, address(this)) ||
                landPixelContract.getApproved(tokenId) == address(this),
            "Not approved"
        );

        // Validate buyNowPrice if it's an auction
        if (saleType == SaleType.Auction) {
            require(buyNowPrice == 0 || buyNowPrice > startingPrice, "Invalid buyNow price");
        }

        // Transfer NFT to marketplace contract
        landPixelContract.transferFrom(msg.sender, address(this), tokenId);

        // Create listing
        listings[tokenId] = Listing({
            saleType: saleType,
            seller: msg.sender,
            highestBidder: msg.sender,
            highestBid: startingPrice,
            startTime: block.timestamp,
            duration: duration,
            active: true,
            buyNowPrice: buyNowPrice,
            paymentToken: paymentToken,
            escrowedAmount: 0
        });

        emit ListingCreated(tokenId, msg.sender, startingPrice, buyNowPrice, paymentToken);
    }

    function unlist(uint256 tokenId) external {
        Listing storage listing = listings[tokenId];
        require(listing.seller == msg.sender, "Not the seller");
        require(
            listing.saleType == SaleType.FixedPrice &&
                (listing.active || block.timestamp >= listing.startTime + listing.duration),
            "Cannot unlist"
        );

        // Update state first (CEI pattern)
        listing.active = false;

        // Return NFT to seller
        landPixelContract.transferFrom(address(this), msg.sender, tokenId);

        emit Unlisted(tokenId, msg.sender);
    }

    function bid(uint256 tokenId, uint256 bidAmount) external payable nonReentrant {
        Listing storage listing = listings[tokenId];
        require(listing.active, "Not active");
        require(listing.saleType == SaleType.Auction, "Not auction");
        require(listing.seller != msg.sender, "Seller cannot bid");
        require(block.timestamp < listing.startTime + listing.duration, "Auction ended");
        // Ensure minimum bid increment
        uint256 minBid = listing.highestBid + ((listing.highestBid * MIN_BID_INCREMENT_BPS) / 10000);
        require(bidAmount >= minBid, "Bid too low");

        // Handle payments first (CEI pattern)
        if (listing.paymentToken == address(0)) {
            require(msg.value == bidAmount, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH not accepted");
            // Transfer tokens to escrow
            IERC20(listing.paymentToken).safeTransferFrom(msg.sender, address(this), bidAmount);
        }

        // Update state
        address previousBidder = listing.highestBidder;
        uint256 previousBid = listing.highestBid;

        listing.highestBidder = msg.sender;
        listing.highestBid = bidAmount;
        listing.escrowedAmount = bidAmount;

        // Handle refund to previous bidder
        if (previousBidder != listing.seller) {
            if (listing.paymentToken == address(0)) {
                escrowBalances[previousBidder][address(0)] += previousBid;
            } else {
                escrowBalances[previousBidder][listing.paymentToken] += previousBid;
            }
        }

        emit BidPlaced(tokenId, msg.sender, bidAmount, listing.paymentToken);
    }

    function withdrawEscrow(address token) external nonReentrant {
        uint256 amount = escrowBalances[msg.sender][token];
        require(amount > 0, "No funds to withdraw");

        // Update state before transfer (CEI pattern)
        escrowBalances[msg.sender][token] = 0;

        // Perform transfer
        if (token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
    }

    function makeOffer(
        uint256 tokenId,
        uint256 duration,
        address paymentToken,
        uint256 amount
    ) external payable nonReentrant validDuration(duration) validPaymentToken(paymentToken) {
        require(landPixelContract.ownerOf(tokenId) != msg.sender, "Cannot self-offer");

        // Check for existing offer from this user
        Offer storage existingOffer = offers[tokenId][msg.sender];
        require(!existingOffer.active, "Existing active offer");

        // Handle payment
        if (paymentToken == address(0)) {
            require(msg.value == amount, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "ETH not accepted");
            require(amount > 0, "Amount must be > 0");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);
        }

        // Create new offer with unique ID
        uint256 offerId = nextOfferId[tokenId]++;
        offers[tokenId][msg.sender] = Offer({
            offerId: offerId,
            offerer: msg.sender,
            amount: amount,
            startTime: block.timestamp,
            duration: duration,
            active: true,
            paymentToken: paymentToken
        });

        emit OfferMade(tokenId, msg.sender, amount, paymentToken);
    }

    function acceptOffer(uint256 tokenId, address offerer, uint256 offerId) external nonReentrant {
        require(landPixelContract.ownerOf(tokenId) == msg.sender, "Not the token owner");

        Offer storage offer = offers[tokenId][offerer];
        require(offer.active, "Offer inactive");
        require(offer.offerId == offerId, "Invalid offer ID");
        require(block.timestamp < offer.startTime + offer.duration, "Offer expired");

        uint256 amount = offer.amount;
        address paymentToken = offer.paymentToken;

        // Deactivate the accepted offer
        offer.active = false;

        // Calculate fees
        uint256 feeAmount = (amount * marketplaceFee) / 10000;
        uint256 sellerAmount = amount - feeAmount;

        // Transfer NFT
        landPixelContract.transferFrom(msg.sender, offerer, tokenId);

        // Transfer payment
        if (paymentToken == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: sellerAmount}("");
            require(success, "Seller payment failed");
            (bool feeSuccess, ) = payable(landBank).call{value: feeAmount}("");
            require(feeSuccess, "Fee transfer failed");
        } else {
            IERC20(paymentToken).safeTransfer(msg.sender, sellerAmount);
            IERC20(paymentToken).safeTransfer(landBank, feeAmount);
        }

        emit SaleFinalized(tokenId, offerer, amount, paymentToken);
    }

    function buyNow(uint256 tokenId) external payable nonReentrant {
        Listing storage listing = listings[tokenId];
        require(msg.sender != listing.seller, "Cannot buy own listing");
        require(listing.active, "Not for sale");
        require(
            listing.saleType == SaleType.FixedPrice ||
                (listing.saleType == SaleType.Auction && listing.buyNowPrice > 0),
            "Buy now not available"
        );

        uint256 price = listing.saleType == SaleType.FixedPrice ? listing.highestBid : listing.buyNowPrice;

        // Handle payment first (CEI pattern)
        if (listing.paymentToken == address(0)) {
            require(msg.value >= price, "Insufficient ETH");
        } else {
            require(msg.value == 0, "ETH not accepted");
            IERC20(listing.paymentToken).safeTransferFrom(msg.sender, address(this), price);
        }

        // Update state
        listing.active = false;

        // Calculate fees with safe math
        uint256 feeAmount = (price * marketplaceFee) / 10000;
        uint256 sellerAmount = price - feeAmount;

        // Handle existing auction refunds if necessary
        if (
            listing.saleType == SaleType.Auction &&
            listing.highestBidder != listing.seller &&
            listing.escrowedAmount > 0
        ) {
            escrowBalances[listing.highestBidder][listing.paymentToken] += listing.escrowedAmount;
            listing.escrowedAmount = 0;
        }

        // Transfer NFT
        landPixelContract.transferFrom(address(this), msg.sender, tokenId);

        // Handle payments
        if (listing.paymentToken == address(0)) {
            // Transfer to seller
            (bool paymentTransferSuccess, ) = payable(listing.seller).call{value: sellerAmount}("");
            require(paymentTransferSuccess, "Seller payment failed");

            // Transfer fee
            (bool feeTransferSuccess, ) = payable(landBank).call{value: feeAmount}("");
            require(feeTransferSuccess, "Fee transfer failed");

            // Return excess ETH
            if (msg.value > price) {
                (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - price}("");
                require(refundSuccess, "Refund failed");
            }
        } else {
            IERC20 token = IERC20(listing.paymentToken);
            token.safeTransfer(listing.seller, sellerAmount);
            token.safeTransfer(landBank, feeAmount);
        }

        emit SaleFinalized(tokenId, msg.sender, price, listing.paymentToken);
    }

    function finalizeAuction(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        require(listing.saleType == SaleType.Auction, "Not an auction");
        require(listing.active, "Already finalized");
        require(block.timestamp >= listing.startTime + listing.duration, "Auction not ended");

        // Update state first (CEI pattern)
        listing.active = false;

        address winner = listing.highestBidder;
        address seller = listing.seller;
        uint256 winningBid = listing.highestBid;
        address paymentToken = listing.paymentToken;

        // If no valid bids, return NFT to seller
        if (winner == seller) {
            landPixelContract.transferFrom(address(this), seller, tokenId);
            emit SaleFinalized(tokenId, seller, 0, paymentToken);
            return;
        }

        // Calculate fees with safe math
        uint256 feeAmount = (winningBid * marketplaceFee) / 10000;
        uint256 sellerAmount = winningBid - feeAmount;

        // Transfer NFT first (since we've already updated state)
        landPixelContract.transferFrom(address(this), winner, tokenId);

        // Handle payments
        if (paymentToken == address(0)) {
            // Transfer ETH to seller
            (bool successSeller, ) = payable(seller).call{value: sellerAmount}("");
            require(successSeller, "Seller payment failed");

            // Transfer fees
            (bool successFees, ) = payable(landBank).call{value: feeAmount}("");
            require(successFees, "Fee transfer failed");
        } else {
            IERC20 token = IERC20(paymentToken);
            // Transfer winning bid to seller (minus fees)
            token.safeTransfer(seller, sellerAmount);
            // Transfer fees to landBank
            token.safeTransfer(landBank, feeAmount);
        }

        // Clear any escrowed amount
        listing.escrowedAmount = 0;

        emit SaleFinalized(tokenId, winner, winningBid, paymentToken);
    }

    function withdrawOffer(uint256 tokenId) external nonReentrant {
        Offer storage offer = offers[tokenId][msg.sender];
        require(offer.active, "No active offer");

        // Update state first (CEI pattern)
        uint256 amount = offer.amount;
        address paymentToken = offer.paymentToken;
        offer.active = false;

        // Transfer funds
        if (paymentToken == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "ETH withdrawal failed");
        } else {
            IERC20(paymentToken).safeTransfer(msg.sender, amount);
        }

        emit OfferWithdrawn(tokenId, msg.sender, amount, paymentToken);
    }

    /*******************************************************************************************\
     *  view function to check minimum required bid
    \*******************************************************************************************/
    function getMinimumBid(uint256 tokenId) external view returns (uint256) {
        Listing storage listing = listings[tokenId];
        require(listing.active && listing.saleType == SaleType.Auction, "Not active auction");
        return listing.highestBid + ((listing.highestBid * MIN_BID_INCREMENT_BPS) / 10000);
    }

    // admin functions
    function setMarketplaceFee(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_FEE, "Fee too high");
        marketplaceFee = newFee;
    }
}
