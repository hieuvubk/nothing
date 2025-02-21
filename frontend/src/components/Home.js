import React from "react";

// Use ethers to interact with the Ethereum network and our contracts
import { ethers } from "ethers";

// enable the BigInt global
/* global BigInt */

// contract artifacts and addresss for ethers usage
import DSTRXToken from "../artifacts/DSTRXToken.json";
import LandPixel from "../artifacts/LandPixel.json";
import LandBank from "../artifacts/LandBankMainFacet.json";
import LandBankAdminFacet from "../artifacts/LandBankAdminFacet.json";
import OwnershipFacet from "../artifacts/OwnershipFacet.json";
import LandBankStakingFacet from "../artifacts/LandBankStakingFacet.json";
import LandPixelMarketplace from "../artifacts/LandPixelMarketplace.json";

// Logic is kept in the Home component; child components are essentially presentational
import { NoWalletDetected } from "./NoWalletDetected";
import { ConnectWallet } from "./ConnectWallet";
import { Loading } from "./Loading";
import { Transfer } from "./Transfer";
import { PixelList } from "./PixelList";
import { UpdateMaxDistrictId } from "./UpdateMaxDistrictId";
import { TransactionErrorMessage } from "./TransactionErrorMessage";
import { WaitingForTransactionMessage } from "./WaitingForTransactionMessage";
import { HexagonGrid } from "./HexagonGrid";
import { StakedPixels } from "./StakedPixels";
import { UpdateRebuyDelay } from "./UpdateRebuyDelay";
import { ListForSale } from "./ListForSale";
import { MarketplaceListings } from "./MarketplaceListings";

// Import constants from constants.js
import {
  DSTRX_TOKEN_CONTRACT_ADDRESS,
  LANDPIXEL_CONTRACT_ADDRESS,
  LANDBANK_CONTRACT_ADDRESS,
  MARKETPLACE_CONTRACT_ADDRESS,
  HARDHAT_NETWORK_ID,
  ERROR_CODE_TX_REJECTED_BY_USER,
} from "../constants";

// This component is in charge of:
//   1. Connecting to the user's wallet
//   2. Initializing ethers and the Token contract
//   3. Polling the user balance to keep it updated
//   4. Transferring tokens by sending transactions
//   5. Rendering the application
//
// This should help demonstrate how to keep front-end and contract's states in sync,
// and how to perform transactions.
export class Home extends React.Component {
  constructor(props) {
    super(props);

    // We store multiple things in the Home state, including DSTRX token information,
    // LandBank settings (like maxDistrictId) and LandPixel ownership statuses, as
    // well as miscellaneous UI-related state settings
    // The selectedAddress (i.e. the connected wallet address) is initialized from
    // localStorage to make page reloads less annoying
    this.initialState = {
      tokenData: undefined,
      selectedAddress: localStorage.getItem("selectedAddress"),
      isAdminOnLandBank: false,
      balance: undefined,
      ethBalance: undefined,
      txBeingSent: undefined,
      transactionError: undefined,
      networkError: undefined,
      showCopiedTooltip: false,
      maxDistrictId: 0,
      lowestVisibleDistrictId: 10,
      userPixels: [],
      alreadyClaimedPixels: undefined,
      stakedPixels: [],
      pendingRewards: "0",
      rebuyDelay: 0,
    };

    this.state = this.initialState;
  }

  componentDidMount() {
    // No longer auto-initialize on mount (to avoid accidental mainnet queries)
    // We'll only initialize when the user explicitly connects
  }

  getFunctionSelector(functionSignature) {
    const iface = new ethers.Interface([functionSignature]);
    const selector = Object.values(iface.fragments)[0].selector;
    console.log(`Selector for ${functionSignature}: ${selector}`);
    return selector;
  }

  render() {
    // Ethereum wallets inject the window.ethereum object. If it hasn't been
    // injected, instruct the user to install a wallet.
    if (window.ethereum === undefined) {
      return <NoWalletDetected />;
    }

    // Check if we have both a selected address AND a valid connection
    const needsConnection =
      !this.state.selectedAddress ||
      !this._provider ||
      this.state.balance == null;

    if (needsConnection) {
      return (
        <ConnectWallet
          connectWallet={() => this._connectWallet()}
          networkError={this.state.networkError}
          dismiss={() => this._dismissNetworkError()}
        />
      );
    }

    // If the token data hasn't loaded yet, we show a loading component.
    if (!this.state.tokenData) {
      return <Loading />;
    }

    // If everything is loaded, we render the application.
    return (
      <div className="container">
        <div className="p-6">
          <div className="row">
            <div className="col-12">
              <div className="flex flex-nowrap justify-content-between align-items-center">
                <div
                  className="flex-grow cursor-copy"
                  title={this.state.selectedAddress}
                  onClick={() =>
                    this._copyToClipboard(this.state.selectedAddress)
                  }
                >
                  <b>Connected Wallet:</b>{" "}
                  {`${this.state.selectedAddress.slice(0, 6)}...${this.state.selectedAddress.slice(-6)}`}
                  {this.state.showCopiedTooltip && (
                    <div className=" tooltip">Copied!</div>
                  )}
                  <button
                    className="ml-2 px-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                    title="Logout"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering copy address
                      this._resetState();
                    }}
                  >
                    ⏏
                  </button>
                </div>
                <div className="flex-grow text-right">
                  <b>Balances:</b> {ethers.formatUnits(this.state.balance)}{" "}
                  {this.state.tokenData.symbol} <b className="text-xl">|</b>{" "}
                  {parseFloat(
                    Number(ethers.formatUnits(this.state.ethBalance)).toFixed(
                      5,
                    ),
                  )}{" "}
                  Ξ
                </div>
              </div>
            </div>
          </div>

          <hr />
          {/*
            The HexagonGrid represents an example of a LandPixel claiming UI (the Map View in Figma)
            https://www.figma.com/design/xaNilvKH8HxyaBzOcN567a/%E2%9C%A8-Design-Handoff---Product-App?node-id=261-48508
            Note that this is just a demo, not a production-level implementation
          */}

          <HexagonGrid
            mintLandPixels={(tokenIds) => this._mintLandPixels(tokenIds)}
            alreadyClaimedPixels={this.state.alreadyClaimedPixels}
            lowestVisibleDistrictId={this.state.lowestVisibleDistrictId}
            onNavigate={(delta) => {
              const newId = Math.max(
                0,
                this.state.lowestVisibleDistrictId + delta,
              );
              this.setState(
                {
                  lowestVisibleDistrictId: newId,
                  alreadyClaimedPixels: undefined, // Reset this so it will be refetched
                },
                async () => {
                  // Fetch new claimed pixels for the new visible range
                  const newAlreadyClaimedPixels =
                    await this._getClaimedLandPixels();
                  await this.setState({
                    alreadyClaimedPixels: newAlreadyClaimedPixels,
                  });
                },
              );
            }}
          />

          {/*
            The PixelList is just a list of the LandPixel holdings of the connected wallet
            so we don't need to show it if the user doesn't hold any LandPixels (yet)
          */}
          {this.state.userPixels.length > 0 && (
            <PixelList
              pixelIds={this.state.userPixels}
              stakedPixels={this.state.stakedPixels}
              onStakeClick={(tokenId) => this._stakeLandPixel(tokenId)}
              onUnstakeClick={(tokenId) => this._unstakeLandPixel(tokenId)}
              renderAdditionalControls={(tokenId) => (
                <ListForSale
                  tokenId={tokenId}
                  onListForSale={(
                    tokenId,
                    startingPrice,
                    saleType,
                    duration,
                    buyNowPrice,
                    paymentToken,
                  ) =>
                    this._listForSale(
                      tokenId,
                      startingPrice,
                      saleType,
                      duration,
                      buyNowPrice,
                      paymentToken,
                    )
                  }
                />
              )}
            />
          )}

          <StakedPixels
            stakedPixels={this.state.stakedPixels}
            pendingRewards={this.state.pendingRewards}
            onUnstakeClick={(tokenId) => this._unstakeLandPixel(tokenId)}
            onClaimRewards={() => this._claimRewards()}
          />

          <div className="row mt-10">
            <div className="col-12">
              {/*
                Sending a transaction isn't an immediate action. You have to wait
                for it to be mined.
                If we are waiting for one, we show a message here.
              */}
              {this.state.txBeingSent && (
                <WaitingForTransactionMessage txHash={this.state.txBeingSent} />
              )}

              {/*
                Sending a transaction can fail in multiple ways.
                If that happened, we show a message here.
              */}
              {this.state.transactionError && (
                <TransactionErrorMessage
                  message={this._getRpcErrorMessage(
                    this.state.transactionError,
                  )}
                  dismiss={() => this._dismissTransactionError()}
                />
              )}
            </div>
          </div>

          <div className="row">
            <div className="col-12">
              {/*
                This component displays a form that an admin can use to update the maxDistrictId
                The component doesn't have logic, it just calls the updateMaxDistrictId
                callback. It will not display if the connected wallet doesn't own the LandBank
              */}
              {this.state.isAdminOnLandBank && (
                <>
                  <UpdateMaxDistrictId
                    updateFunction={(newMax) =>
                      this._updateMaxDistrictId(newMax)
                    }
                    currentMax={this.state.maxDistrictId}
                  />
                  <UpdateRebuyDelay
                    updateFunction={(newDelay) =>
                      this._updateRebuyDelay(newDelay)
                    }
                    currentDelay={this.state.rebuyDelay}
                  />
                </>
              )}
            </div>
          </div>

          <div className="row">
            <div className="col-12">
              {/*
                This component displays a form that the user can use to send a
                transaction and transfer DSTRX tokens.
                The component doesn't have logic, it just calls the transferTokens
                callback.
              */}
              {this.state.balance > 0n && (
                <Transfer
                  transferTokens={(to, amount) =>
                    this._transferTokens(to, amount)
                  }
                  tokenSymbol={this.state.tokenData.symbol}
                />
              )}
            </div>
          </div>

          {this.state.selectedAddress && (
            <MarketplaceListings
              marketplace={this._marketplace}
              onBuyNow={(tokenId, price) => this._buyNow(tokenId, price)}
              onPlaceBid={(tokenId, bidAmount) =>
                this._placeBid(tokenId, bidAmount)
              }
            />
          )}
        </div>
      </div>
    );
  }

  componentWillUnmount() {
    // Auto-polling the user's balance should be stopped when Home gets unmounted
    this._stopPollingData();
  }

  async _connectWallet() {
    try {
      await this._checkNetwork();

      // First ensure we have a provider
      if (!window.ethereum) {
        throw new Error("No ethereum provider found - is MetaMask installed?");
      }

      // Create ethers provider
      const provider = new ethers.BrowserProvider(window.ethereum);

      // Get signer
      const signer = await provider.getSigner();

      // Get the selected address
      const selectedAddress = await signer.getAddress();
      console.log("Connected wallet address:", selectedAddress);

      localStorage.setItem("selectedAddress", selectedAddress);

      await this._checkNetwork();
      await this._initialize(selectedAddress);

      // Store provider and signer for later use
      this.provider = provider;
      this.signer = signer;

      window.ethereum.on("accountsChanged", async ([newAddress]) => {
        this._stopPollingData();
        if (newAddress === undefined) {
          return this._resetState();
        }
        // Update signer when account changes
        this.signer = await this.provider.getSigner();
        this._initialize(newAddress);
      });
    } catch (error) {
      console.error("Connection error:", error);
      throw error;
    }
  }

  async _initialize(userAddress) {
    // This method initializes the application

    // We first store the user's address in the component's state
    this.setState({
      selectedAddress: userAddress,
    });

    // Then, we initialize ethers, fetch the token's data, and start polling
    // for the user's balance.

    // Fetching the token data and the user's balance are specific to this
    // sample project, but you can reuse the same initialization pattern.
    await this._initializeEthers();
    this._getTokenData();
    this._startPollingData();
  }

  async _initializeEthers() {
    try {
      // We first initialize ethers by creating a provider using window.ethereum
      this._provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await this._provider.getSigner();

      // Initialize contracts...
      this._token = new ethers.Contract(
        DSTRX_TOKEN_CONTRACT_ADDRESS,
        DSTRXToken.abi,
        signer,
      );

      // Initialize the LandPixel ERC721 NFT contract using our provider
      this._landpixel = new ethers.Contract(
        LANDPIXEL_CONTRACT_ADDRESS,
        LandPixel.abi,
        signer,
      );

      // Initialize the user-facing LandBank contract using our provider
      this._landbank = new ethers.Contract(
        LANDBANK_CONTRACT_ADDRESS,
        LandBank.abi,
        signer,
      );

      // Initialize the admin-facing LandBank contract using our provider
      this._landbankAdmin = new ethers.Contract(
        LANDBANK_CONTRACT_ADDRESS,
        LandBankAdminFacet.abi,
        signer,
      );

      // Initialize the LandBank ownership facet for ownership checks
      this._landbankOwner = new ethers.Contract(
        LANDBANK_CONTRACT_ADDRESS,
        OwnershipFacet.abi,
        signer,
      );

      this._staking = new ethers.Contract(
        LANDBANK_CONTRACT_ADDRESS,
        LandBankStakingFacet.abi,
        signer,
      );

      // Initialize the marketplace contract
      this._marketplace = new ethers.Contract(
        MARKETPLACE_CONTRACT_ADDRESS,
        LandPixelMarketplace.abi,
        signer,
      );

      // Initialize state with default values
      this.setState({
        stakedPixels: [],
        isAdminOnLandBank: false,
        userPixels: [],
        alreadyClaimedPixels: [],
        maxDistrictId: 0,
        rebuyDelay: 0, // Set a default value first
      });

      // Only attempt to fetch data if we have explicitly connected
      // Check both selectedAddress and that we're past the connect wallet screen
      if (
        this.state.selectedAddress &&
        !this.state.networkError &&
        this._provider
      ) {
        try {
          // Verify contract code exists at address only after wallet connection
          console.log("Verifying contract addresses...");
          console.log("LandBank address:", LANDBANK_CONTRACT_ADDRESS);
          console.log("LandPixel address:", LANDPIXEL_CONTRACT_ADDRESS);
          console.log("DSTRX Token address:", DSTRX_TOKEN_CONTRACT_ADDRESS);

          const code = await this._provider.getCode(LANDBANK_CONTRACT_ADDRESS);
          if (code === "0x") {
            console.error("No contract found at LandBank address");
            throw new Error("Invalid contract address");
          }

          // Verify the ABI contains the owner function
          if (!this._landbankOwner.interface.hasFunction("owner")) {
            console.error("OwnershipFacet ABI does not contain owner function");
            console.log(
              "Available functions:",
              Object.keys(this._landbankOwner.interface.functions),
            );
            throw new Error("Invalid contract ABI");
          }

          // Add more detailed error handling for owner call
          let landBankOwner;
          try {
            landBankOwner = await this._landbankOwner.owner();
          } catch (ownerError) {
            throw ownerError;
          }

          const isAdmin =
            landBankOwner &&
            this.state.selectedAddress.toLowerCase() ===
              landBankOwner.toLowerCase();

          // Update admin status immediately
          this.setState({ isAdminOnLandBank: isAdmin });

          // Fetch remaining data
          const [stakedPixels, maxDistrictId, userPixels, claimedPixels] =
            await Promise.all([
              this._staking
                .getUserStakedTokens(this.state.selectedAddress)
                .catch(() => []),
              this._landbank.getMaxDistrictId().catch(() => 0),
              this._getLandPixelsCurrentUserOwns().catch(() => []),
              this._getClaimedLandPixels().catch(() => []),
            ]);

          // Try to get rebuyDelay, but don't fail if it's not available
          let rebuyDelay = 0;
          try {
            rebuyDelay = await this._landbank.getRebuyDelay();
          } catch (error) {
            console.warn("Could not fetch rebuyDelay:", error);
          }

          // Update state with remaining data
          this.setState({
            stakedPixels: stakedPixels
              ? stakedPixels.map((n) => Number(n))
              : [],
            maxDistrictId: Number(maxDistrictId),
            userPixels,
            alreadyClaimedPixels: claimedPixels,
            rebuyDelay: Number(rebuyDelay),
          });
        } catch (error) {
          console.error("Error during data fetching:", error);
          // Don't throw here - allow partial initialization
        }
      } else {
        console.log("Skipping data fetch - wallet not fully connected yet");
      }
    } catch (error) {
      console.error("Failed to initialize ethers:", error);
      this.setState({
        networkError:
          "Failed to initialize blockchain connection. Please try again.",
      });
      throw error;
    }
  }

  // The next two methods are needed to start and stop polling data. While
  // the data being polled here is specific to this example, you can use this
  // pattern to read any data from your contracts.
  //
  // Note that if you don't need it to update in near real time, you probably
  // don't need to poll it. If that's the case, you can just fetch it when you
  // initialize the app, as done with the token data.
  _startPollingData() {
    this._pollDataInterval = setInterval(() => {
      this._updateBalance();
      this._updatePendingRewards();
    }, 2000);

    // Run both immediately
    this._updateBalance();
    this._updatePendingRewards();
  }

  _stopPollingData() {
    clearInterval(this._pollDataInterval);
    this._pollDataInterval = undefined;
  }

  // The next two methods just read from the contract and store the results
  // in the component state.
  async _getTokenData() {
    const name = await this._token.name();
    const symbol = await this._token.symbol();

    this.setState({ tokenData: { name, symbol } });
  }

  async _getClaimedLandPixels() {
    // Find out (from on-chain querying) which LandPixels in our list (0-11) are already claimed
    // Note: although the on-chain data should be considered the source of truth, for faster
    // querying and rendering, it probably makes more sense to store this data locally (in a db)
    // and query that on page loads rather than fetching from provider/chain data directly
    // The implementation here is just to demonstrate a simple web3 approach to fetching info
    const pixelExistenceResults = [];

    for (
      let i = this.state.lowestVisibleDistrictId;
      i < this.state.lowestVisibleDistrictId + 12;
      i++
    ) {
      try {
        // First check if the contract has the exists function
        if (typeof this._landpixel.exists !== "function") {
          console.warn("exists function not found on contract");
          // Try alternative method - check owner
          const owner = await this._landpixel.ownerOf(i).catch(() => null);
          pixelExistenceResults.push({
            tokenId: i,
            exists: owner !== null,
          });
        } else {
          const exists = await this._landpixel.exists(i);
          pixelExistenceResults.push({
            tokenId: i,
            exists: exists,
          });
        }
      } catch (error) {
        //console.warn(`Error checking token ${i}:`, error);
        // Assume token doesn't exist if we can't verify
        pixelExistenceResults.push({
          tokenId: i,
          exists: false,
        });
      }
    }

    return pixelExistenceResults.filter((r) => r.exists).map((r) => r.tokenId);
  }

  async _getLandPixelsCurrentUserOwns() {
    // Find out (from on-chain querying) which LandPixels are owned by the connected user's wallet
    // Note: although the on-chain data should be considered the source of truth, for faster
    // querying and rendering, it probably makes more sense to store this data locally (in a db)
    // and query that on page loads rather than fetching from provider/chain data directly
    // The implementation here is just to demonstrate a simple web3 approach to fetching info

    const totalPixelsOwned = await this._landpixel.balanceOf(
      this.state.selectedAddress,
    );

    const userPixels = [];

    for (let i = 0; i < Number(totalPixelsOwned); i++) {
      try {
        const ownedPixelId = await this._landpixel.tokenOfOwnerByIndex(
          this.state.selectedAddress,
          i,
        );
        userPixels.push(Number(ownedPixelId));
      } catch (error) {
        console.error(`Error checking token owner for ${i}:`, error);
      }
    }

    return userPixels;
  }

  async _updateBalance() {
    const balance = await this._token.balanceOf(this.state.selectedAddress);
    const ethBalance = await this._provider.getBalance(
      this.state.selectedAddress,
    );

    this.setState({ balance });
    this.setState({ ethBalance });
  }

  async _copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ showCopiedTooltip: true });
      setTimeout(() => {
        this.setState({ showCopiedTooltip: false });
      }, 2000); // Hide after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }

  // This method attempts to mint LandPixel NFTs via the LandBank contract
  async _mintLandPixels(tokenIds) {
    // Sending a transaction is a complex operation:
    //   - The user can reject it
    //   - It can fail before reaching the ethereum network (i.e. if the user
    //     doesn't have ETH for paying for the tx's gas)
    //   - It has to be mined, so it isn't immediately confirmed.
    //     Note that some testing networks, like Hardhat Network, do mine
    //     transactions immediately, but your dapp should be prepared for
    //     other networks.
    //   - It can fail once mined.
    //
    // This method handles all of these things.
    try {
      // If a transaction fails, we save that error in the component's state.
      // We only save one such error, so before sending a second transaction, we
      // clear it.
      this._dismissTransactionError();

      // Ensure tokenIds is properly formatted as an array of BigNumbers
      const formattedTokenIds = tokenIds.map((id) => BigInt(id));

      const tx = await this._landbank.mintLandPixels(formattedTokenIds, {
        value: ethers.parseEther("1.0") * BigInt(tokenIds.length),
      });

      this.setState({ txBeingSent: tx.hash });

      // We use .wait() to wait for the transaction to be mined. This method
      // returns the transaction's receipt.
      const receipt = await tx.wait();

      // The receipt, contains a status flag, which is 0 to indicate an error.
      if (receipt.status === 0) {
        // We can't know the exact error that made the transaction fail when it
        // was mined, so we throw this generic one.
        throw new Error("Transaction failed");
      }

      // If we got here, the transaction was successful, so you may want to
      // update your state. Here, we update the user's balance.
      await this._updateBalance();

      // Here, we update the list of user's LandPixels
      const userPixels = await this._getLandPixelsCurrentUserOwns();
      this.setState({ userPixels });
    } catch (error) {
      // We check the error code to see if this error was produced because the
      // user rejected a tx. If that's the case, we do nothing.
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }

      // Other errors are logged and stored in the Home's state. This is used to
      // show them to the user, and for debugging.
      console.error(error);
      this.setState({ transactionError: error.message });
    } finally {
      // If we leave the try/catch, we aren't sending a tx anymore, so we clear
      // this part of the state.
      this.setState({ txBeingSent: undefined });
    }
  }

  // This method sends an ethereum transaction to transfer tokens.
  // This demonstrates how to send DSTRX tokens
  async _transferTokens(to, amount) {
    // Sending a transaction is a complex operation:
    //   - The user can reject it
    //   - It can fail before reaching the ethereum network (i.e. if the user
    //     doesn't have ETH for paying for the tx's gas)
    //   - It has to be mined, so it isn't immediately confirmed.
    //     Note that some testing networks, like Hardhat Network, do mine
    //     transactions immediately, but your dapp should be prepared for
    //     other networks.
    //   - It can fail once mined.
    //
    // This method handles all of these things.

    try {
      // If a transaction fails, we save that error in the component's state.
      // We only save one such error, so before sending a second transaction, we
      // clear it.
      this._dismissTransactionError();

      // We send the transaction, and save its hash in the Home's state. This
      // way we can indicate that we are waiting for it to be mined.
      const tx = await this._token.transfer(to, amount);
      this.setState({ txBeingSent: tx.hash });

      // We use .wait() to wait for the transaction to be mined. This method
      // returns the transaction's receipt.
      const receipt = await tx.wait();

      // The receipt, contains a status flag, which is 0 to indicate an error.
      if (receipt.status === 0) {
        // We can't know the exact error that made the transaction fail when it
        // was mined, so we throw this generic one.
        throw new Error("Transaction failed");
      }

      // If we got here, the transaction was successful, so you may want to
      // update your state. Here, we update the user's balance.
      await this._updateBalance();
    } catch (error) {
      // We check the error code to see if this error was produced because the
      // user rejected a tx. If that's the case, we do nothing.
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }

      // Other errors are logged and stored in the Home's state. This is used to
      // show them to the user, and for debugging.
      console.error(error);
      this.setState({ transactionError: this._getRpcErrorMessage(error) });
    } finally {
      // If we leave the try/catch, we aren't sending a tx anymore, so we clear
      // this part of the state.
      this.setState({ txBeingSent: undefined });
    }
  }

  // This method sends an admin transaction call to update the max district ID (ceiling)
  async _updateMaxDistrictId(newMax) {
    try {
      this._dismissTransactionError();

      // Convert newMax to BigNumber if it's not already
      const newMaxBigInt = BigInt(newMax);

      // Get signer's current nonce
      const signer = await this._provider.getSigner();
      const nonce = await this._provider.getTransactionCount(signer.address);

      // Prepare transaction with detailed options
      const tx = await this._landbankAdmin.updateMaxDistrictId(newMaxBigInt, {
        nonce: nonce,
        gasLimit: 100000,
      });

      this.setState({ txBeingSent: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }

      // Update the state with the new maxDistrictId
      this.setState({ maxDistrictId: Number(newMax) });
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }

      console.error("Update MaxDistrictId Error:", error);
      this.setState({
        transactionError: error.reason || error.message || "Transaction failed",
      });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  // clear transactionError part of the state
  _dismissTransactionError() {
    this.setState({ transactionError: undefined });
  }

  // clear networkError part of the state
  _dismissNetworkError() {
    this.setState({ networkError: undefined });
  }

  // utility method to turn an RPC error into a human readable message
  _getRpcErrorMessage(error) {
    if (error.data) {
      return error.data.message;
    }

    if (error.message) {
      return error.message;
    }

    if (error.errorMessage) {
      return error.errorMessage;
    }

    return error;
  }

  // This method resets the state
  _resetState() {
    // Clear localStorage when resetting
    localStorage.removeItem("selectedAddress");
    this.setState(this.initialState);
  }

  async _switchChain() {
    const chainIdHex = `0x${HARDHAT_NETWORK_ID.toString(16)}`;
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    await this._initialize(this.state.selectedAddress);
  }

  // This method checks if the selected network is Localhost:8545
  _checkNetwork() {
    if (window.ethereum.networkVersion !== HARDHAT_NETWORK_ID) {
      this._switchChain();
    }
  }

  async _stakeLandPixel(tokenId) {
    try {
      this._dismissTransactionError();

      // First approve the LandBank contract to transfer the NFT
      const approveTx = await this._landpixel.approve(
        LANDBANK_CONTRACT_ADDRESS,
        tokenId,
      );
      await approveTx.wait();

      const tx = await this._staking.stakeLandPixel(tokenId);
      this.setState({ txBeingSent: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }

      // Update staked pixels list
      const stakedPixels = await this._staking.getUserStakedTokens(
        this.state.selectedAddress,
      );
      this.setState({
        stakedPixels: stakedPixels.map((n) => Number(n)),
      });
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }
      console.error(error);
      this.setState({ transactionError: this._getRpcErrorMessage(error) });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  async _unstakeLandPixel(tokenId) {
    try {
      this._dismissTransactionError();

      const tx = await this._staking.unstakeLandPixel(tokenId);
      this.setState({ txBeingSent: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }

      // Update staked pixels list
      const stakedPixels = await this._staking.getUserStakedTokens(
        this.state.selectedAddress,
      );
      this.setState({
        stakedPixels: stakedPixels.map((n) => Number(n)),
      });
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }
      console.error(error);
      this.setState({ transactionError: this._getRpcErrorMessage(error) });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  async _updatePendingRewards() {
    try {
      // Check if staking contract is properly initialized
      if (!this._staking) {
        console.warn("Staking contract not initialized");
        return;
      }

      // Check if we have a selected address
      if (!this.state.selectedAddress) {
        console.warn("No address selected");
        return;
      }

      const rewards = await this._staking.getPendingRewards(
        this.state.selectedAddress,
      );

      this.setState({
        pendingRewards: rewards ? ethers.formatEther(rewards) : "0",
      });
    } catch (error) {
      console.error("Error fetching pending rewards:", {
        error,
        message: error.message,
        code: error.code,
        data: error.data,
        address: this.state.selectedAddress,
        contractAddress: this._staking?.target,
      });

      // Set rewards to 0 if there's an error
      this.setState({
        pendingRewards: "0",
      });
    }
  }

  async _claimRewards() {
    try {
      this._dismissTransactionError();

      // Verify contract state
      if (!this._staking || !this._staking.target) {
        throw new Error("Staking contract not properly initialized");
      }

      // Check pending rewards
      const pendingRewards = await this._staking.getPendingRewards(
        this.state.selectedAddress,
      );
      console.log(
        "Pending rewards before claim:",
        ethers.formatEther(pendingRewards),
      );

      if (pendingRewards <= 0n) {
        throw new Error("No rewards available to claim");
      }

      // Try first with simple transaction parameters
      try {
        const tx = await this._staking.claimAllRewards();
        console.log("Transaction sent:", tx.hash);
        this.setState({ txBeingSent: tx.hash });
        const receipt = await tx.wait();
        console.log("Transaction receipt:", receipt);
      } catch (firstAttemptError) {
        console.log("First attempt failed, trying with explicit parameters...");

        // If first attempt fails, try with explicit parameters
        const gasLimit = 300000n;
        const feeData = await this._provider.getFeeData();

        const tx = await this._staking.claimAllRewards({
          gasLimit,
          gasPrice: feeData.gasPrice ? feeData.gasPrice * 2n : undefined, // Add some buffer to the gas price
        });

        console.log("Transaction sent (second attempt):", tx.hash);
        this.setState({ txBeingSent: tx.hash });
        const receipt = await tx.wait();
        console.log("Transaction receipt:", receipt);
      }

      // Update rewards and balance
      await this._updatePendingRewards();
      await this._updateBalance();

      console.log("Claim rewards completed successfully");
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        console.log("Transaction rejected by user");
        return;
      }

      console.error("Claim rewards error:", {
        message: error.message,
        code: error.code,
        reason: error.reason,
        data: error.data,
      });

      let errorMessage = "Failed to claim rewards: ";
      if (error.reason) {
        errorMessage += error.reason;
      } else if (error.data?.message) {
        errorMessage += error.data.message;
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += "Unknown error occurred";
      }

      this.setState({ transactionError: errorMessage });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  async _updateRebuyDelay(newDelay) {
    try {
      this._dismissTransactionError();

      const newDelayBigInt = BigInt(newDelay);

      const tx = await this._landbankAdmin.updateRebuyDelay(newDelayBigInt);
      this.setState({ txBeingSent: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }

      // Update the state with the new rebuyDelay
      this.setState({ rebuyDelay: Number(newDelay) });
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }

      console.error("Update RebuyDelay Error:", error);
      this.setState({
        transactionError: error.reason || error.message || "Transaction failed",
      });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  async _listForSale(
    tokenId,
    startingPrice,
    saleType,
    duration,
    buyNowPrice,
    paymentToken,
  ) {
    try {
      this._dismissTransactionError();

      // First approve the marketplace contract if not already approved
      const isApproved = await this._landpixel.isApprovedForAll(
        this.state.selectedAddress,
        MARKETPLACE_CONTRACT_ADDRESS,
      );

      if (!isApproved) {
        const approveTx = await this._landpixel.setApprovalForAll(
          MARKETPLACE_CONTRACT_ADDRESS,
          true,
        );
        await approveTx.wait();
      }

      // Now list the token for sale
      const tx = await this._marketplace.listForSale(
        tokenId,
        startingPrice,
        saleType,
        duration,
        buyNowPrice,
        paymentToken,
      );

      this.setState({ txBeingSent: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }

      // Refresh user's pixels after listing
      const userPixels = await this._getLandPixelsCurrentUserOwns();
      this.setState({ userPixels });
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }
      console.error(error);
      this.setState({ transactionError: this._getRpcErrorMessage(error) });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  async _placeBid(tokenId, bidAmount) {
    try {
      this._dismissTransactionError();

      const tx = await this._marketplace.bid(tokenId, bidAmount, {
        value: bidAmount,
      });

      this.setState({ txBeingSent: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }

      // Refresh user's pixels after bidding
      await this._updateUserPixels();
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }
      console.error(error);
      this.setState({ transactionError: this._getRpcErrorMessage(error) });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  async _buyNow(tokenId, price) {
    try {
      this._dismissTransactionError();

      const priceInWei = ethers.parseEther(price.toString());

      const tx = await this._marketplace.buyNow(tokenId, {
        value: priceInWei,
      });

      this.setState({ txBeingSent: tx.hash });

      const receipt = await tx.wait();

      if (receipt.status === 0) {
        throw new Error("Transaction failed");
      }

      // Refresh user's pixels after purchase
      await this._updateUserPixels();
    } catch (error) {
      if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
        return;
      }
      console.error(error);
      this.setState({ transactionError: this._getRpcErrorMessage(error) });
    } finally {
      this.setState({ txBeingSent: undefined });
    }
  }

  async _updateUserPixels() {
    try {
      // Fetch updated list of user's pixels
      const userPixels = await this._getLandPixelsCurrentUserOwns();

      // Update balances
      await this._updateBalance();

      // Update state with new pixel list
      this.setState({ userPixels });
    } catch (error) {
      console.error("Error updating user pixels:", error);
    }
  }
}
