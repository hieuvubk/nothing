import React, { useState } from "react";
import { ethers } from "ethers";

export function ListForSale({ tokenId, onListForSale }) {
  const [startingPrice, setStartingPrice] = useState("");
  const [saleType, setSaleType] = useState("0"); // 0 = FixedPrice, 1 = Auction
  const [duration, setDuration] = useState("86400"); // Default 1 day in seconds
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [paymentToken, setPaymentToken] = useState(
    "0x0000000000000000000000000000000000000000",
  ); // Default to ETH

  const handleSubmit = (e) => {
    e.preventDefault();

    try {
      // Convert price from ETH to wei
      const priceInWei = ethers.parseEther(startingPrice);
      const buyNowPriceInWei = buyNowPrice ? ethers.parseEther(buyNowPrice) : 0;

      onListForSale(
        tokenId,
        priceInWei,
        Number(saleType),
        Number(duration),
        buyNowPriceInWei,
        paymentToken,
      );
    } catch (error) {
      console.error("Error in listing:", error);
    }
  };

  return (
    <div className="p-4 bg-gray-100 rounded-lg mb-4">
      <h4 className="mb-3">List LandPixel #{tokenId} for Sale</h4>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block mb-1">Sale Type:</label>
          <select
            className="w-full p-2 border rounded"
            value={saleType}
            onChange={(e) => setSaleType(e.target.value)}
          >
            <option value="0">Fixed Price</option>
            <option value="1">Auction</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="block mb-1">
            {saleType === "0" ? "Price (ETH):" : "Starting Price (ETH):"}
          </label>
          <input
            type="number"
            step="0.000000000000000001"
            className="w-full p-2 border rounded"
            value={startingPrice}
            onChange={(e) => setStartingPrice(e.target.value)}
            required
          />
        </div>

        {saleType === "1" && (
          <div className="mb-3">
            <label className="block mb-1">Buy Now Price (ETH, optional):</label>
            <input
              type="number"
              step="0.000000000000000001"
              className="w-full p-2 border rounded"
              value={buyNowPrice}
              onChange={(e) => setBuyNowPrice(e.target.value)}
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block mb-1">Duration (seconds):</label>
          <input
            type="number"
            className="w-full p-2 border rounded"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            min="3600"
            max="2592000"
            required
          />
          <small className="text-gray-500">
            Min: 1 hour (3600s), Max: 30 days (2592000s)
          </small>
        </div>

        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          List for Sale
        </button>
      </form>
    </div>
  );
}
