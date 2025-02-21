import React from "react";

export function TransactionErrorMessage({ message, dismiss }) {
  return (
    <div className="alert alert-danger mt-10 pt-10" role="alert">
      <span className="text-red-500 font-bold">Error:</span>{" "}
      {message.substring(0, 1000)}
      <button
        type="button"
        className="close"
        data-dismiss="alert"
        aria-label="Close"
        onClick={dismiss}
      >
        <span className="ml-5" aria-hidden="true">
          &times;
        </span>
      </button>
    </div>
  );
}
