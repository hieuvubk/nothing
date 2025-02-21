import React from "react";

export function NoWalletDetected() {
  return (
    <div className="container">
      <div className="row justify-content-md-center">
        <div className="col-6 p-4 text-center">
          <p>
            No Ethereum wallet was detected. <br />
            To use Districts, please install a wallet such as Coinbase wallet,
            Trust Wallet, or{" "}
            <b>
              <a
                href="http://metamask.io"
                target="_blank"
                rel="noopener noreferrer"
              >
                MetaMask
              </a>
            </b>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
