import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import LandPixel from "../artifacts/LandPixel.json";
import { LANDPIXEL_CONTRACT_ADDRESS } from "../constants"; // Make sure this exists

export function MarketplaceListings({ marketplace, onBuyNow, onPlaceBid }) {
  const [listings, setListings] = useState([]);
  const [bidAmounts, setBidAmounts] = useState({});

  useEffect(() => {
    loadListings();
    // Set up polling every 10 seconds
    const interval = setInterval(loadListings, 10000);

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, [marketplace]);

  const loadListings = async () => {
    try {
      // Get the total supply from the LandPixel contract directly
      const landPixelContract = new ethers.Contract(
        LANDPIXEL_CONTRACT_ADDRESS,
        LandPixel.abi,
        marketplace.runner,
      );

      const totalSupply = await landPixelContract.totalSupply();
      const activeListings = [];

      for (let i = 0; i < totalSupply; i++) {
        const tokenId = await landPixelContract.tokenByIndex(i);
        const listing = await marketplace.listings(tokenId);

        if (listing.active) {
          activeListings.push({
            tokenId: tokenId.toString(),
            seller: listing.seller,
            saleType: Number(listing.saleType),
            startTime: Number(listing.startTime),
            duration: Number(listing.duration), // This is in seconds
            highestBid: ethers.formatEther(listing.highestBid),
            buyNowPrice:
              listing.buyNowPrice.toString() !== "0"
                ? ethers.formatEther(listing.buyNowPrice)
                : null,
            active: listing.active,
          });
        }
      }

      setListings(activeListings);
    } catch (error) {
      console.error("Error loading listings:", error);
    }
  };

  const handleBidSubmit = async (tokenId, bidAmount) => {
    try {
      if (!bidAmount || isNaN(bidAmount)) {
        console.error("Invalid bid amount:", bidAmount);
        return;
      }

      // Convert bid amount to Wei
      const bidAmountInWei = ethers.parseEther(bidAmount.toString());

      await onPlaceBid(tokenId, bidAmountInWei);
      // Clear bid amount after successful submission
      setBidAmounts((prev) => ({ ...prev, [tokenId]: "" }));
      // Reload listings to show updated state
      await loadListings();
    } catch (error) {
      console.error("Error placing bid:", error);
    }
  };

  const handleBuyNow = async (tokenId, price) => {
    try {
      await onBuyNow(tokenId, price);
      await loadListings();
    } catch (error) {
      console.error("Error buying now:", error);
    }
  };

  const isAuctionEnded = (startTime, duration) => {
    const endTime = Number(startTime) + Number(duration);
    return Date.now() / 1000 > endTime;
  };

  const formatTimeLeft = (startTime, duration) => {
    try {
      // If startTime is somehow in the future, assume the auction starts now
      const effectiveStartTime = Math.min(
        startTime,
        Math.floor(Date.now() / 1000),
      );
      const endTime = effectiveStartTime + duration;
      const timeLeft = Math.max(0, endTime - Math.floor(Date.now() / 1000));

      if (timeLeft <= 0) return "Ended";

      const days = Math.floor(timeLeft / 86400);
      const hours = Math.floor((timeLeft % 86400) / 3600);
      const minutes = Math.floor((timeLeft % 3600) / 60);

      // Only show days if there are any
      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
      }
      // Only show hours if there are any
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      // Otherwise just show minutes
      return `${minutes}m`;
    } catch (error) {
      console.error("Error formatting time:", error);
      return "Time calculation error";
    }
  };

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Marketplace Listings</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {listings.map((listing) => (
          <div key={listing.tokenId} className="border p-4 rounded shadow">
            <h3 className="text-lg font-semibold">
              LandPixel #{listing.tokenId}
            </h3>
            {listing.seller && (
              <p className="text-sm text-gray-600">
                Seller: {listing.seller.slice(0, 6)}...
                {listing.seller.slice(-4)}
              </p>
            )}
            <p className="text-sm text-gray-600">
              Type: {listing.saleType === 0 ? "Fixed Price" : "Auction"}
            </p>

            {listing.saleType === 0 ? (
              // Fixed Price Listing
              <div className="mt-2">
                <p className="font-medium">Price: {listing.highestBid} ETH</p>
                <button
                  className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 w-full"
                  onClick={() =>
                    handleBuyNow(listing.tokenId, listing.highestBid)
                  }
                >
                  Buy Now
                </button>
              </div>
            ) : (
              // Auction Listing
              <div className="mt-2">
                <p className="font-medium">
                  Current Bid: {listing.highestBid} ETH
                </p>
                {listing.buyNowPrice && (
                  <p className="font-medium">
                    Buy Now: {listing.buyNowPrice} ETH
                  </p>
                )}
                <p className="text-sm text-gray-600">
                  Time Left:{" "}
                  {formatTimeLeft(listing.startTime, listing.duration)}
                </p>

                {!isAuctionEnded(listing.startTime, listing.duration) && (
                  <div className="mt-2">
                    <input
                      type="number"
                      step="0.000000000000000001"
                      className="w-full p-2 border rounded mb-2"
                      placeholder="Bid amount in ETH"
                      value={bidAmounts[listing.tokenId] || ""}
                      onChange={(e) =>
                        setBidAmounts((prev) => ({
                          ...prev,
                          [listing.tokenId]: e.target.value,
                        }))
                      }
                    />
                    <button
                      className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 w-full"
                      onClick={() =>
                        handleBidSubmit(
                          listing.tokenId,
                          bidAmounts[listing.tokenId],
                        )
                      }
                    >
                      Place Bid
                    </button>
                    {listing.buyNowPrice && (
                      <button
                        className="mt-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 w-full"
                        onClick={() =>
                          handleBuyNow(listing.tokenId, listing.buyNowPrice)
                        }
                      >
                        Buy Now
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
