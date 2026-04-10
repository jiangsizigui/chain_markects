export enum MarketStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  RESOLVED = 'RESOLVED'
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET'
}

export enum OutcomeType {
  YES = 'YES',
  NO = 'NO'
}

export enum OrderStatus {
  OPEN = 'OPEN',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED'
}

export interface Market {
  id: number;
  title: string;
  description: string;
  endTime: string;
  resolutionSource: string;
  status: MarketStatus;
  category: string;
  yesPrice: number; // 0-100
  noPrice: number;  // 0-100
  volume: number;
  participants: number;
  resolvedOutcome?: OutcomeType;
  resolvedAt?: string;
  resolvedEvidence?: string;
}

export interface Order {
  id: string;
  userId: string;
  marketId: number;
  outcome: OutcomeType;
  side: OrderSide;
  type?: OrderType;
  price: number;
  amount: number; // Number of shares
  remainingAmount: number;
  status: OrderStatus;
  createdAt: string;

  // 撮合归一化字段：将二元市场统一映射到 YES 基础订单簿
  baseOutcome?: OutcomeType; // always YES
  baseSide?: OrderSide; // BUY/SELL in base book
  basePrice?: number; // 0-100 in base book
  baseIsMarket?: boolean;

  // 锁定信息：用于撤单时正确解锁
  lockedBalanceAmount?: number; // locked PMT amount
  lockedSpotAmount?: number; // locked shares (for SELL spot portion)
}

export interface Trade {
  id: string;
  marketId: number;
  price: number;
  amount: number;
  buyerId: string;
  sellerId: string;
  outcome: OutcomeType;
  timestamp: string;

  // 参与者视角信息：用于“买 NO = 做空”仍能正确展示
  buyerOrderId?: string;
  sellerOrderId?: string;
  buyerOutcome?: OutcomeType;
  sellerOutcome?: OutcomeType;
  buyerSide?: OrderSide;
  sellerSide?: OrderSide;
  buyerPrice?: number;
  sellerPrice?: number;
}

export interface Position {
  userId: string;
  marketId: number;
  yesAmount: number;
  noAmount: number;
  lockedYesAmount: number;
  lockedNoAmount: number;
  avgYesPrice: number;
  avgNoPrice: number;
}

export interface Wallet {
  userId: string;
  balance: number;
  lockedBalance: number;
}
