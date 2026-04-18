// Shapes of messages received from the master server via WebSocket

export interface EntrySignal {
  type: 'entry';
  action: 'Buy' | 'Sell';
  symbol: string;
  quantity: number;
  orderType: 'Market' | 'Limit';
  price: number | null;          // null for market orders
  tradeId: string | null;
  bracket1: BracketConfig | null; // Take Profit
  bracket2: BracketConfig | null; // Stop Loss
  timestamp: string;
}

export interface ExitSignal {
  type: 'exit';
  symbol: string;
  quantity: number;               // 0 = full close, >0 = partial close
  tradeId: string | null;
  reason: 'tp' | 'sl' | 'manual';
  timestamp: string;
}

export interface UpdateBracketsSignal {
  type: 'update-brackets';
  symbol: string;
  tradeId: string | null;
  stopLoss: number | null;   // null = leave unchanged
  takeProfit: number | null; // null = leave unchanged
  timestamp: string;
}

export interface ConnectedMessage {
  type: 'connected';
  label: string;
}

export interface BracketConfig {
  action: 'Buy' | 'Sell';
  orderType: 'Limit' | 'Stop';
  price: number | null;
  stopPrice: number | null;
  isOffset: boolean;
  offset: number | null;
}

export type IncomingMessage = EntrySignal | ExitSignal | UpdateBracketsSignal | ConnectedMessage;
export type TradeSignal = EntrySignal | ExitSignal | UpdateBracketsSignal;
