import React from "react";

export function UpdateMaxDistrictId({ updateFunction, currentMax }) {
  return (
    <div className="mt-5">
      <h4 className="text-xl font-bold mb-1">
        Update Max District ID (currently {currentMax})
      </h4>
      <form
        onSubmit={(event) => {
          // This function just calls the transferTokens callback with the
          // form's data.
          event.preventDefault();

          const formData = new FormData(event.target);
          const newMax = formData.get("newMax");

          if (newMax) {
            updateFunction(newMax);
          }
        }}
      >
        <div className="form-group pt-2">
          <label>New Max</label>
          <input
            className="form-control form-control-lg rounded-3 border-2 shadow-sm ml-4 p-1 mb-2"
            type="number"
            step="1"
            name="newMax"
            placeholder="1"
            required
          />
        </div>
        <div className="form-group">
          <input
            className="btn btn-primary btn-lg text-white font-medium rounded-lg shadow-md cursor-pointer px-4 px-6 py-2.5 bg-blue-500 hover:bg-blue-600"
            type="submit"
            value="Update"
          />
        </div>
      </form>
    </div>
  );
}
