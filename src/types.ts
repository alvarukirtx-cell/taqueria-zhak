export type Role = 'admin' | 'usuario';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  address?: string;
  phone?: string;
  createdAt: string;
}

export type Category = 'tacos' | 'bebidas' | 'extras' | 'postres';

export interface Product {
  id: string;
  name: string;
  category: Category;
  price: number;
  description: string;
  available: boolean;
}

export type OrderStatus = 'pendiente' | 'preparacion' | 'en_camino' | 'entregado' | 'cancelado';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  category: Category;
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  items: OrderItem[];
  observations: string;
  deliveryAddress: string;
  deliveryPhone: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  updatedAt: string;
}

export interface Sale {
  id: string;
  pedidoId: string;
  total: number;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface CancelledOrder {
  id: string;
  pedidoId: string;
  userId: string;
  userEmail: string;
  reason: string;
  cancelledAt: string;
}

export interface DashboardStats {
  totalEarnings: number;
  dailyEarnings: { [date: string]: number };
  usersCount: number;
  ordersInPrepCount: number;
  ordersCompletedCount: number;
  ordersCancelledCount: number;
  topSoldProducts: { [productName: string]: number };
}
