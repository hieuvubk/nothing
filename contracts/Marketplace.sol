// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./facets/LandPixelFacet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

error InvalidDuration();
error InvalidTokenContract();
error TokenNotWhitelisted();
error ZeroPrice();
error NotTokenOwner();
error AlreadyListed();
error NotApproved();
error InvalidBuyNowPrice();
error ListingNotFound();
error NotSeller();
error CannotUnlist();
error NotActive();
error NotAuction();
error SellerCannotBid();
error AuctionEnded();
error BidTooLow();
error IncorrectPaymentAmount();
error NativeTokenNotAccepted();
error NoFundsToWithdraw();
error TransferFailed();
error CannotSelfOffer();
error TokenIsListed();
error ExistingActiveOffer();
error OfferInactive();
error InvalidOfferId();
error OfferExpired();
error CannotBuyOwnListing();
error BuyNowUnavailable();
error InsufficientPayment();
error ListingExpired();
error AuctionNotEnded();
error FeeTooHigh();
error CannotWhitelistNative();

contract LandPixelMarketplace is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SaleType {
        FixedPrice,
        Auction
    }

    struct Listing {
        uint256 listingId;
        SaleType saleType;
        address seller;
        address highestBidder;
        uint256 highestBid;
        uint256 startTime;
        uint256 duration;
        bool active;
        uint256 buyNowPrice;
        address paymentToken; // native token = address(0)
        uint256 escrowedAmount; // Track escrowed amount for refunds
        uint256 tokenId;
    }

    struct Offer {
        uint256 offerId;
        address offerer;
        uint256 amount;
        uint256 startTime;
        uint256 duration;
        bool active;
        address paymentToken; // native token = address(0)
    }

    mapping(uint256 => Listing) public listings; // listingId => Listing
    mapping(uint256 => mapping(address => Offer)) public offers;
    mapping(address => mapping(address => uint256)) private escrowBalances; // user => token => amount
    mapping(uint256 => uint256) private nextOfferId; // tokenId => offerId
    mapping(uint256 => uint256) public activeListingForToken;
    mapping(address => bool) public whitelistedTokens;
    uint256 private nextListingId = 1;

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
    event TokenWhitelistUpdated(address token, bool isWhitelisted);

    modifier validDuration(uint256 duration) {
        if (duration == 0 || duration > MAX_DURATION) revert InvalidDuration();
        _;
    }

    modifier validPaymentToken(address token) {
        if (token != address(0)) {
            if (token.code.length == 0) revert InvalidTokenContract();
            if (!whitelistedTokens[token]) revert TokenNotWhitelisted();
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
    ) external nonReentrant validDuration(duration) validPaymentToken(paymentToken) returns (uint256) {
        if (startingPrice == 0) revert ZeroPrice();
        if (landPixelContract.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (activeListingForToken[tokenId] != 0) revert AlreadyListed();
        if (
            !landPixelContract.isApprovedForAll(msg.sender, address(this)) &&
            landPixelContract.getApproved(tokenId) != address(this)
        ) revert NotApproved();

        // Validate buyNowPrice if it's an auction
        if (saleType == SaleType.Auction) {
            if (buyNowPrice != 0 && buyNowPrice <= startingPrice) revert InvalidBuyNowPrice();
        }

        // Transfer NFT to marketplace contract
        landPixelContract.transferFrom(msg.sender, address(this), tokenId);

        // Generate new listing ID
        uint256 listingId = nextListingId++;

        // Create listing
        Listing memory newListing = Listing({
            listingId: listingId,
            saleType: saleType,
            seller: msg.sender,
            highestBidder: msg.sender,
            highestBid: startingPrice,
            startTime: block.timestamp,
            duration: duration,
            active: true,
            buyNowPrice: buyNowPrice,
            paymentToken: paymentToken,
            escrowedAmount: 0,
            tokenId: tokenId
        });

        listings[listingId] = newListing;
        activeListingForToken[tokenId] = listingId;

        emit ListingCreated(tokenId, msg.sender, startingPrice, buyNowPrice, paymentToken);
        return listingId;
    }

    function unlist(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        if (listing.listingId == 0) revert ListingNotFound();
        if (listing.seller != msg.sender) revert NotSeller();
        if (listing.saleType != SaleType.FixedPrice || !listing.active) revert CannotUnlist();

        // Update state first (CEI pattern)
        listing.active = false;

        // Return NFT to seller
        landPixelContract.transferFrom(address(this), msg.sender, listing.tokenId);

        // Clear the active listing reference
        activeListingForToken[listing.tokenId] = 0;

        emit Unlisted(listing.tokenId, msg.sender);
    }

    function bid(uint256 listingId, uint256 bidAmount) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        if (listing.listingId == 0) revert ListingNotFound();
        if (!listing.active) revert NotActive();
        if (listing.saleType != SaleType.Auction) revert NotAuction();
        if (listing.seller == msg.sender) revert SellerCannotBid();
        if (block.timestamp >= listing.startTime + listing.duration) revert AuctionEnded();

        // Ensure minimum bid increment
        uint256 minBid = listing.highestBid + ((listing.highestBid * MIN_BID_INCREMENT_BPS) / 10000);
        if (bidAmount <= listing.highestBid || bidAmount < minBid) revert BidTooLow();

        // Handle payments first (CEI pattern)
        if (listing.paymentToken == address(0)) {
            if (msg.value < bidAmount) revert InsufficientPayment();
        } else {
            if (msg.value != 0) revert NativeTokenNotAccepted();
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

        // Return excess native token payment if any
        if (listing.paymentToken == address(0) && msg.value > bidAmount) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - bidAmount}("");
            require(refundSuccess, "Refund failed");
        }

        emit BidPlaced(listing.tokenId, msg.sender, bidAmount, listing.paymentToken);
    }

    function withdrawEscrow(address token) external nonReentrant {
        uint256 amount = escrowBalances[msg.sender][token];
        if (amount == 0) revert NoFundsToWithdraw();

        // Update state before transfer (CEI pattern)
        escrowBalances[msg.sender][token] = 0;

        // Perform transfer
        if (token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            if (!success) revert TransferFailed();
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
        if (amount == 0) revert ZeroPrice();
        if (landPixelContract.ownerOf(tokenId) == msg.sender) revert CannotSelfOffer();
        if (activeListingForToken[tokenId] != 0) revert TokenIsListed();

        // Check for existing offer from this user
        Offer storage existingOffer = offers[tokenId][msg.sender];
        if (existingOffer.active) revert ExistingActiveOffer();

        // Handle payment
        if (paymentToken == address(0)) {
            if (msg.value != amount) revert IncorrectPaymentAmount();
        } else {
            if (msg.value != 0) revert NativeTokenNotAccepted();
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
        if (landPixelContract.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        Offer storage offer = offers[tokenId][offerer];
        if (!offer.active) revert OfferInactive();
        if (offer.offerId != offerId) revert InvalidOfferId();
        if (block.timestamp >= offer.startTime + offer.duration) revert OfferExpired();

        // Store values in memory before state changes
        uint256 amount = offer.amount;
        address paymentToken = offer.paymentToken;

        // Deactivate the accepted offer
        offer.active = false;
        // Clear any active listing reference if it exists
        if (activeListingForToken[tokenId] != 0) {
            activeListingForToken[tokenId] = 0;
        }

        // Calculate fees (rounding up)
        uint256 feeAmount = (amount * marketplaceFee + 9999) / 10000;
        uint256 sellerAmount = amount - feeAmount;

        // Transfer NFT
        landPixelContract.transferFrom(msg.sender, offerer, tokenId);

        // Transfer payment
        if (paymentToken == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: sellerAmount}("");
            if (!success) revert TransferFailed();
            (bool feeSuccess, ) = payable(landBank).call{value: feeAmount}("");
            if (!feeSuccess) revert TransferFailed();
        } else {
            IERC20(paymentToken).safeTransfer(msg.sender, sellerAmount);
            IERC20(paymentToken).safeTransfer(landBank, feeAmount);
        }

        emit SaleFinalized(tokenId, offerer, amount, paymentToken);
    }

    function buyNow(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        if (listing.listingId == 0) revert ListingNotFound();
        if (msg.sender == listing.seller) revert CannotBuyOwnListing();
        if (!listing.active) revert NotActive();
        if (block.timestamp >= listing.startTime + listing.duration) revert ListingExpired();
        if (
            listing.saleType != SaleType.FixedPrice &&
            (listing.saleType != SaleType.Auction || listing.buyNowPrice == 0)
        ) revert BuyNowUnavailable();

        uint256 price = listing.buyNowPrice;

        // Calculate fees with safe math (rounding up)
        uint256 feeAmount = (price * marketplaceFee + 9999) / 10000;
        uint256 sellerAmount = price - feeAmount;

        // Handle payment first (CEI pattern)
        if (listing.paymentToken == address(0)) {
            if (msg.value < price) revert InsufficientPayment();

            // Transfer to seller and landBank directly
            (bool paymentTransferSuccess, ) = payable(listing.seller).call{value: sellerAmount}("");
            require(paymentTransferSuccess, "Payment failed");

            (bool feeTransferSuccess, ) = payable(landBank).call{value: feeAmount}("");
            require(feeTransferSuccess, "Fee transfer failed");

            // Return excess native token payment
            if (msg.value > price) {
                (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - price}("");
                require(refundSuccess, "Refund failed");
            }
        } else {
            if (msg.value != 0) revert NativeTokenNotAccepted();
            // Transfer tokens directly to seller and landBank
            IERC20(listing.paymentToken).safeTransferFrom(msg.sender, listing.seller, sellerAmount);
            IERC20(listing.paymentToken).safeTransferFrom(msg.sender, landBank, feeAmount);
        }

        // Update state
        listing.active = false;

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
        landPixelContract.transferFrom(address(this), msg.sender, listing.tokenId);

        // Clear the active listing reference
        activeListingForToken[listing.tokenId] = 0;

        emit SaleFinalized(listing.tokenId, msg.sender, price, listing.paymentToken);
    }

    function finalizeAuction(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        if (listing.listingId == 0) revert ListingNotFound();
        if (listing.saleType != SaleType.Auction) revert NotAuction();
        if (!listing.active) revert NotActive();
        if (block.timestamp < listing.startTime + listing.duration) revert AuctionNotEnded();

        // Store all needed values in memory before state changes
        address winner = listing.highestBidder;
        address seller = listing.seller;
        uint256 winningBid = listing.highestBid;
        address paymentToken = listing.paymentToken;
        uint256 tokenId = listing.tokenId;

        listing.active = false;
        listing.escrowedAmount = 0;
        activeListingForToken[tokenId] = 0;

        // If no valid bids, return NFT to seller and exit early
        if (winner == seller) {
            // External interaction
            landPixelContract.transferFrom(address(this), seller, tokenId);
            emit SaleFinalized(tokenId, seller, 0, paymentToken);
            return;
        }

        // Calculate fees with safe math (rounding up)
        uint256 feeAmount = (winningBid * marketplaceFee + 9999) / 10000;
        uint256 sellerAmount = winningBid - feeAmount;

        // Transfer NFT
        landPixelContract.transferFrom(address(this), winner, tokenId);

        // Handle payments
        if (paymentToken == address(0)) {
            // Transfer native token to seller
            (bool successSeller, ) = payable(seller).call{value: sellerAmount}("");
            if (!successSeller) revert TransferFailed();

            // Transfer fees
            (bool successFees, ) = payable(landBank).call{value: feeAmount}("");
            if (!successFees) revert TransferFailed();
        } else {
            IERC20 token = IERC20(paymentToken);
            // Transfer winning bid to seller (minus fees)
            token.safeTransfer(seller, sellerAmount);
            // Transfer fees to landBank
            token.safeTransfer(landBank, feeAmount);
        }

        emit SaleFinalized(tokenId, winner, winningBid, paymentToken);
    }

    function withdrawOffer(uint256 tokenId) external nonReentrant {
        Offer storage offer = offers[tokenId][msg.sender];
        if (!offer.active) revert OfferInactive();

        // Update state first (CEI pattern)
        uint256 amount = offer.amount;
        address paymentToken = offer.paymentToken;
        offer.active = false;

        // Transfer funds
        if (paymentToken == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(paymentToken).safeTransfer(msg.sender, amount);
        }

        emit OfferWithdrawn(tokenId, msg.sender, amount, paymentToken);
    }

    /*******************************************************************************************\
     *  view function to check minimum required bid
    \*******************************************************************************************/
    function getMinimumBid(uint256 listingId) external view returns (uint256) {
        Listing storage listing = listings[listingId];
        if (listing.listingId == 0) revert ListingNotFound();
        if (!listing.active || listing.saleType != SaleType.Auction) revert NotAuction();
        return listing.highestBid + ((listing.highestBid * MIN_BID_INCREMENT_BPS) / 10000);
    }

    // admin function to set marketplace fee
    function setMarketplaceFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_FEE) revert FeeTooHigh();
        marketplaceFee = newFee;
    }

    // admin function to manage whitelisted tokens
    function setTokenWhitelisted(address token, bool isWhitelisted) external onlyOwner {
        if (token == address(0)) revert CannotWhitelistNative();
        if (token.code.length == 0) revert InvalidTokenContract();
        whitelistedTokens[token] = isWhitelisted;
        emit TokenWhitelistUpdated(token, isWhitelisted);
    }
}
