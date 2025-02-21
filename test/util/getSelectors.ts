export function getSelectors(contract: any) {
  const fragments = contract.interface.fragments;
  const selectors = new Set();

  fragments
    .filter((fragment: any) => fragment.type === "function")
    .forEach((fragment: any) => {
      try {
        const selector = contract.interface.getFunction(
          fragment.format(),
        ).selector;
        // Skip ERC165 supportsInterface selector
        if (selector !== "0x01ffc9a7") {
          selectors.add(selector);
        }
      } catch (e) {
        // Skip any problematic functions
        console.warn(`Skipping ambiguous function: ${fragment.format()}`);
      }
    });

  return Array.from(selectors);
}
