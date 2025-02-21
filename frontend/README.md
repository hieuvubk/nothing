# Sample React Districts Frontend

This directory has a sample app to interact with Districts contracts, built using
React, specifically from [the Hardhat boilerplate project](https://hardhat.org/tutorial/boilerplate-project).

## Running

To run this front-end application, first make sure you're running a local Hardhat network with Districts contracts deployed to it ([as described in the root-level README of the parent repository](../README.md#getting-started)), then from this (`frontend`) directory, execute `npm start` in a terminal, and open
[http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

This example project uses [`create-react-app`](https://create-react-app.dev/), most
configuration files are handled by it. It consists of multiple React Components, which you can find in
`src/components`.

Most of these are presentational components, have no logic, and just render HTML.

The core functionality is in [`src/components/Home.js`](src/components/Home.js), which has heavily-commented
examples of how to connect to the user's wallet, initialize your Ethereum
connection and contracts, read from the contracts' states, and send transactions.

The `Home` component should serve as a reference point for interacting with the
LandBank, LandPixel, and DSTRXToken contracts.
