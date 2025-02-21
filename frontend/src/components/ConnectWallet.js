import React from "react";

import { NetworkErrorMessage } from "./NetworkErrorMessage";

export function ConnectWallet({ connectWallet, networkError, dismiss }) {
  return (
    <div className="container">
      <div className="row justify-content-md-center">
        <div className="col-12 text-center">
          {/* Wallet network should be set to Localhost:8545. */}
          {networkError && (
            <NetworkErrorMessage message={networkError} dismiss={dismiss} />
          )}
        </div>
        <div className="col-6 p-4 text-center">
          <p>Please connect to your wallet.</p>
          <button
            className="mt-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-50
                   text-white font-medium rounded-lg shadow-md
                   transition-colors duration-200
                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
            type="button"
            onClick={connectWallet}
          >
            Connect Wallet
          </button>
        </div>
      </div>
    </div>
  );
}
