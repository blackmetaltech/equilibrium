// Teaching failures of actions (DESIGN §8.3): what rule was broken and what to do about it. Stubs until the design actions land (1.9).
export const errors: Record<string, string> = {
  'err.connect.occupied': 'That inlet already has a pipe. Mix two streams with a Mixer first.',
  'err.connect.pump_gas': 'A pump moves liquids. To raise the pressure of a gas, use a compressor.',
  'err.split.range': 'A split fraction is a share of the stream: it must be between 0 and 1.',
  'err.commission.open_port': 'Stream from {unit} outlet goes nowhere. Every outlet must end in a unit, a product tank or the stack.',
};
