/** GitHub Light's parameter orange fails AA for small text. Keep source tokens intact. */
export const workbenchContrast = {
  name: 'workbench-contrast',
  tokens(lines: { color?: string }[][]) {
    for (const line of lines) {
      for (const token of line) {
        if (token.color?.toLowerCase() === '#e36209') token.color = '#a44024';
      }
    }
  },
};
