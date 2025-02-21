import React, { useState } from "react";

const HexagonButton = ({
  children,
  onClick,
  className = "",
  size = "md",
  isActive,
  alreadyClaimed,
}) => {
  const sizes = {
    sm: { width: 100, height: 86.6 },
    md: { width: 140, height: 121.24 },
    lg: { width: 180, height: 155.88 },
  };

  const { width, height } = sizes[size];

  const points = () => {
    const x = width / 2;
    const y = height / 2;
    const radius = width / 2;

    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((i * 60 - 30) * Math.PI) / 180;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      points.push(`${px},${py}`);
    }
    return points.join(" ");
  };

  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex items-center justify-center ${className}`}
      style={{
        width,
        height,
        border: "none",
        background: "none",
        padding: 0,
        cursor: alreadyClaimed ? "not-allowed" : "pointer",
      }}
    >
      <svg
        width={width}
        height={height}
        className="absolute top-0 left-0"
        style={{ pointerEvents: "none" }}
      >
        <polygon
          points={points()}
          className={`${alreadyClaimed ? "fill-red-500 hover:fill-red-600" : isActive ? "fill-green-500 hover:fill-green-600" : "fill-blue-500 hover:fill-blue-600"} 
                     transition-colors duration-200 stroke-black stroke-2`}
        />
      </svg>
      <span
        className="relative z-10 text-white font-medium"
        style={{ pointerEvents: "none" }}
      >
        {children}
      </span>
    </button>
  );
};

export const HexagonGrid = ({
  mintLandPixels,
  alreadyClaimedPixels,
  lowestVisibleDistrictId = 0,
  rows = 3,
  cols = 4,
  size = "sm",
  onNavigate,
}) => {
  const [activeHexagons, setActiveHexagons] = useState(new Set());
  const [processingClaims, setProcessingClaims] = useState(new Set());

  const sizes = {
    sm: { width: 100, height: 86.6 },
    md: { width: 140, height: 121.24 },
    lg: { width: 180, height: 155.88 },
  };

  const { width, height } = sizes[size];

  const horizontalSpacing = width * 0.87; // Adjusted for better overlap
  const verticalSpacing = height * 0.81; // Adjusted for better vertical spacing

  const toggleHexagon = (key) => {
    setActiveHexagons((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        // Check both alreadyClaimedPixels and processingClaims
        if (
          !alreadyClaimedPixels?.includes(key) &&
          !processingClaims.has(key)
        ) {
          newSet.add(key);
        }
      }
      return newSet;
    });
  };

  const claimPixels = (activePixels) => {
    // Add the pixels to processingClaims before minting
    setProcessingClaims(new Set([...processingClaims, ...activePixels]));
    mintLandPixels(Array.from(activePixels));
    setActiveHexagons(new Set());
  };

  return (
    <div className="relative">
      {/* Navigation Buttons */}
      <button
        onClick={() => onNavigate(-12)} // Move back 12 pixels
        className="absolute left-0 top-1/2 transform -translate-y-1/2
                 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-400"
        style={{ zIndex: 10 }}
      >
        ←
      </button>

      <button
        onClick={() => onNavigate(12)} // Move forward 12 pixels
        className="absolute right-0 top-1/2 transform -translate-y-1/2
                 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-400"
        style={{ zIndex: 10 }}
      >
        →
      </button>

      <div
        className="relative m-auto mt-10"
        style={{
          width: horizontalSpacing * cols + width * 0.25,
          height: verticalSpacing * rows + height * 0.5,
        }}
      >
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: cols }, (_, col) => {
            const key = col + row * cols + lowestVisibleDistrictId;
            return (
              <div
                key={key}
                className="absolute"
                style={{
                  left: `${col * horizontalSpacing + (row % 2 ? horizontalSpacing / 2 : 0)}px`,
                  top: `${row * verticalSpacing}px`,
                  transform: "translate(0, 0)", // Force GPU acceleration
                }}
              >
                <HexagonButton
                  size={size}
                  isActive={activeHexagons.has(key)}
                  alreadyClaimed={
                    alreadyClaimedPixels?.includes(Number(key)) ||
                    processingClaims.has(key)
                  }
                  onClick={() => toggleHexagon(key)}
                >
                  {key}
                </HexagonButton>
              </div>
            );
          }),
        )}
      </div>
      <button
        disabled={activeHexagons.size === 0}
        onClick={() => claimPixels(activeHexagons)}
        className="absolute mt-2 right-10 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-50
                   text-white font-medium rounded-lg shadow-md
                   transition-colors duration-200
                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
      >
        Claim Land Pixels
      </button>
    </div>
  );
};
