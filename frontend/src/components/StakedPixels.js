import React from "react";

export const StakedPixels = ({
  stakedPixels,
  pendingRewards,
  onUnstakeClick,
  onClaimRewards,
}) => {
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg mt-12">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          Staked LandPixels
        </h2>
        <div className="text-right">
          <div
            className="text-sm text-gray-600 mb-2"
            title={pendingRewards ? Number(pendingRewards) : "0"}
          >
            Pending Rewards:{" "}
            {pendingRewards ? Number(pendingRewards).toFixed(2) : "0"} DSTRX
          </div>
          <button
            onClick={onClaimRewards}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 
                     text-white rounded-lg font-medium transition-colors"
            disabled={!pendingRewards || pendingRewards === "0"}
          >
            Claim Rewards
          </button>
        </div>
      </div>

      {stakedPixels.length > 0 ? (
        <ul className="space-y-2">
          {stakedPixels.map((number) => (
            <li
              key={number}
              className="p-3 bg-gradient-to-r from-green-50 to-green-100
                         rounded-lg border border-green-200 shadow-sm
                         hover:shadow-md transition-shadow duration-200
                         flex items-center justify-between"
            >
              <div className="flex items-center">
                <span
                  className="w-8 h-8 flex items-center justify-center
                             bg-green-500 text-white rounded-full mr-3
                             font-medium"
                >
                  {number}
                </span>
                <span className="text-gray-700">LandPixel ID: {number}</span>
              </div>
              <button
                onClick={() => onUnstakeClick(number)}
                className="px-4 py-2 rounded-lg font-medium
                           bg-red-500 hover:bg-red-600 text-white"
              >
                Unstake
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 text-center py-4">No staked pixels yet</p>
      )}
    </div>
  );
};
