import React from "react";
import { ethers } from "ethers";

export function Transfer({ transferTokens, tokenSymbol }) {
  return (
    <div className="mt-5">
      <h4 className="text-xl font-bold mb-1">Transfer ({tokenSymbol})</h4>
      <form
        onSubmit={(event) => {
          // This function just calls the transferTokens callback with the
          // form's data.
          event.preventDefault();

          const formData = new FormData(event.target);
          const to = formData.get("to");
          const amount = ethers.parseEther(formData.get("amount"));

          if (to && amount) {
            transferTokens(to, amount);
          }
        }}
      >
        <div className="form-group pt-2">
          <label>Amount</label>
          <input
            className="form-control form-control-lg rounded-3 border-2 shadow-sm ml-4 p-1"
            type="number"
            step="0.00000001"
            name="amount"
            placeholder="1"
            required
          />
        </div>
        <div className="form-group pt-2">
          <label>Recipient address</label>
          <input
            className="form-control form-control-lg rounded-3 border-2 shadow-sm ml-4 p-1"
            type="text"
            name="to"
            required
          />
        </div>
        <div className="form-group">
          <input
            className="btn btn-primary btn-lg text-white font-medium rounded-lg shadow-md cursor-pointer px-4 px-6 py-2.5 bg-blue-500 hover:bg-blue-600"
            type="submit"
            value="Transfer"
          />
        </div>
      </form>
    </div>
  );
}
