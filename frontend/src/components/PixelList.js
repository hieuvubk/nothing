import React from "react";

export function PixelList({
  pixelIds,
  stakedPixels,
  onStakeClick,
  onUnstakeClick,
  renderAdditionalControls,
}) {
  return (
    <div className="mt-4">
      <h3>Your LandPixels:</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pixelIds.map((tokenId) => (
          <div key={tokenId} className="border p-4 rounded">
            <h4>LandPixel #{tokenId}</h4>
            {stakedPixels.includes(tokenId) ? (
              <button
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                onClick={() => onUnstakeClick(tokenId)}
              >
                Unstake
              </button>
            ) : (
              <>
                <button
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 mr-2"
                  onClick={() => onStakeClick(tokenId)}
                >
                  Stake
                </button>
                {renderAdditionalControls && renderAdditionalControls(tokenId)}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
