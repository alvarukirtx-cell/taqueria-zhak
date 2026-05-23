import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, User as FirebaseUser } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  collection, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  getDocFromServer,
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Product, Order, UserProfile, Sale, CancelledOrder, OrderStatus, Role } from '../types';
import { INITIAL_PRODUCTS } from '../data/defaultProducts';

// --- Error Handlers (Mandatory Section 3 Skill Requirement) ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const isReal = isFirebaseConfigured();
  const authInstance = isReal ? getAuth() : null;
  const currentFbUser = authInstance?.currentUser;

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentFbUser?.uid || null,
      email: currentFbUser?.email || null,
      emailVerified: currentFbUser?.emailVerified || null,
      isAnonymous: currentFbUser?.isAnonymous || null,
      tenantId: currentFbUser?.tenantId || null,
      providerInfo: currentFbUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error details: ', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

// --- Dynamic Env Check ---
export function isFirebaseConfigured(): boolean {
  return (
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== 'PLACEHOLDER_KEY' &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== 'placeholder-project'
  );
}

export function isFirestoreActive(userId?: string): boolean {
  if (!isFirebaseConfigured()) return false;
  
  if (userId && (
    userId.startsWith('googlesim_') || 
    userId.startsWith('admin_uid_') || 
    userId.startsWith('user_uid_')
  )) {
    return false;
  }

  try {
    const stored = localStorage.getItem('taqueria_villa_active_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.uid && (
        parsed.uid.startsWith('googlesim_') || 
        parsed.uid.startsWith('admin_uid_') || 
        parsed.uid.startsWith('user_uid_')
      )) {
        return false;
      }
    }
  } catch (e) {}
  return true;
}

// Ensure unique instantiation of Firebase
let dbInstance: any = null;
let authInstance: any = null;

if (isFirebaseConfigured()) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    authInstance = getAuth(app);
    
    // Validate connection to Firestore as requested in the Skill instructions
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(dbInstance, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("Please check your Firebase configuration or internet connection.");
        }
      }
    };
    testConnection();
  } catch (err) {
    console.error("Failed to initialize Firebase SDK:", err);
  }
}

export const db = dbInstance;
export const auth = authInstance;

// --- Simulated Database Engine (LocalStorage Fallback) ---
const LOCAL_STORAGE_KEYS = {
  PRODUCTS: 'taqueria_villa_productos',
  ORDERS: 'taqueria_villa_pedidos',
  USERS: 'taqueria_villa_usuarios',
  SALES: 'taqueria_villa_ventas',
  CANCELLED: 'taqueria_villa_pedidos_cancelados',
  CURRENT_USER: 'taqueria_villa_active_user',
  DARK_MODE: 'taqueria_villa_dark_mode'
};

// Initialize localStorage contents if it's the first run
const getLocalData = <T>(key: string, defaultValue: T): T => {
  const stored = localStorage.getItem(key);
  if (!stored) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(stored) as T;
  } catch {
    return defaultValue;
  }
};

const setLocalData = <T>(key: string, data: T): void => {
  localStorage.setItem(key, JSON.stringify(data));
};

// Mock Auth Profiles for easy developer testing and preview toggling
export const DEVELOPER_ACCOUNTS: UserProfile[] = [
  {
    uid: 'admin_uid_alvaru_1',
    email: 'alvarukirtx@gmail.com',
    displayName: 'Álvaro (Admin)',
    role: 'admin',
    phone: '55 1234 5678',
    address: 'Av. Paseo de la Reforma 222, CDMX',
    createdAt: new Date('2026-01-15T12:00:00Z').toISOString()
  },
  {
    uid: 'user_uid_carlos_2',
    email: 'carlos.mendoza@gmail.com',
    displayName: 'Carlos Mendoza',
    role: 'usuario',
    phone: '55 9876 5432',
    address: 'Calle Jalapa 142, Col. Roma Norte, CDMX',
    createdAt: new Date('2026-03-10T15:30:00Z').toISOString()
  },
  {
    uid: 'user_uid_sofia_3',
    email: 'sofia.gomez@gmail.com',
    displayName: 'Sofía Gómez',
    role: 'usuario',
    phone: '55 4567 8901',
    address: 'Calle Hamburgo 88, Col. Juárez, CDMX',
    createdAt: new Date('2026-05-12T10:15:00Z').toISOString()
  }
];

// --- High-fidelity Database Interface Adapter ---
export const dbService = {
  isUsingFirebase(): boolean {
    return isFirestoreActive();
  },

  // 1. PRODUCTS OPERATIONS
  async getProducts(): Promise<Product[]> {
    if (isFirestoreActive()) {
      try {
        const querySnapshot = await getDocs(collection(db, 'productos'));
        const productsList: Product[] = [];
        querySnapshot.forEach((doc) => {
          productsList.push(doc.data() as Product);
        });
        if (productsList.length === 0) {
          // Sync with default products first time
          for (const item of INITIAL_PRODUCTS) {
            await this.saveProduct(item);
          }
          return INITIAL_PRODUCTS;
        }
        return productsList;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'productos');
        return INITIAL_PRODUCTS;
      }
    } else {
      return getLocalData<Product[]>(LOCAL_STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    }
  },

  async saveProduct(product: Product): Promise<void> {
    if (isFirestoreActive()) {
      try {
        await setDoc(doc(db, 'productos', product.id), product);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `productos/${product.id}`);
      }
    } else {
      const products = await this.getProducts();
      const index = products.findIndex(p => p.id === product.id);
      if (index >= 0) {
        products[index] = product;
      } else {
        products.push(product);
      }
      setLocalData(LOCAL_STORAGE_KEYS.PRODUCTS, products);
    }
  },

  async deleteProduct(id: string): Promise<void> {
    if (isFirestoreActive()) {
      try {
        await deleteDoc(doc(db, 'productos', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `productos/${id}`);
      }
    } else {
      const products = await this.getProducts();
      const filtered = products.filter(p => p.id !== id);
      setLocalData(LOCAL_STORAGE_KEYS.PRODUCTS, filtered);
    }
  },

  // 2. USER PROFILE OPERATIONS
  async saveUserProfile(profile: UserProfile): Promise<void> {
    if (isFirestoreActive(profile.uid)) {
      try {
        await setDoc(doc(db, 'usuarios', profile.uid), profile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `usuarios/${profile.uid}`);
      }
    } else {
      const users = getLocalData<UserProfile[]>(LOCAL_STORAGE_KEYS.USERS, DEVELOPER_ACCOUNTS);
      const index = users.findIndex(u => u.uid === profile.uid);
      if (index >= 0) {
        users[index] = profile;
      } else {
        users.push(profile);
      }
      setLocalData(LOCAL_STORAGE_KEYS.USERS, users);
    }
  },

  async getUserProfile(uid: string, fallbackEmail?: string, fallbackName?: string): Promise<UserProfile | null> {
    if (isFirestoreActive(uid)) {
      try {
        const userDoc = await getDoc(doc(db, 'usuarios', uid));
        if (userDoc.exists()) {
          return userDoc.data() as UserProfile;
        }
        
        // If not exists, provision new profile on-the-fly
        if (fallbackEmail) {
          const role: Role = fallbackEmail === 'alvarukirtx@gmail.com' ? 'admin' : 'usuario';
          const newProfile: UserProfile = {
            uid,
            email: fallbackEmail,
            displayName: fallbackName || fallbackEmail.split('@')[0],
            role,
            createdAt: new Date().toISOString()
          };
          await this.saveUserProfile(newProfile);
          return newProfile;
        }
        return null;
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `usuarios/${uid}`);
        return null;
      }
    } else {
      const users = getLocalData<UserProfile[]>(LOCAL_STORAGE_KEYS.USERS, DEVELOPER_ACCOUNTS);
      const found = users.find(u => u.uid === uid);
      if (found) return found;
      if (fallbackEmail) {
        const role: Role = fallbackEmail === 'alvarukirtx@gmail.com' ? 'admin' : 'usuario';
        const newProfile: UserProfile = {
          uid,
          email: fallbackEmail,
          displayName: fallbackName || fallbackEmail.split('@')[0],
          role,
          createdAt: new Date().toISOString()
        };
        users.push(newProfile);
        setLocalData(LOCAL_STORAGE_KEYS.USERS, users);
        return newProfile;
      }
      return null;
    }
  },

  async getAllRegisteredUsers(): Promise<UserProfile[]> {
    if (isFirestoreActive()) {
      try {
        const querySnapshot = await getDocs(collection(db, 'usuarios'));
        const list: UserProfile[] = [];
        querySnapshot.forEach((doc) => {
          list.push(doc.data() as UserProfile);
        });
        return list;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'usuarios');
        return [];
      }
    } else {
      return getLocalData<UserProfile[]>(LOCAL_STORAGE_KEYS.USERS, DEVELOPER_ACCOUNTS);
    }
  },

  // 3. ORDERS OPERATIONS
  async getOrders(userId?: string): Promise<Order[]> {
    if (isFirestoreActive(userId)) {
      try {
        const colRef = collection(db, 'pedidos');
        const qRef = userId ? query(colRef, where('userId', '==', userId)) : colRef;
        const querySnapshot = await getDocs(qRef);
        const list: Order[] = [];
        querySnapshot.forEach((doc) => {
          list.push(doc.data() as Order);
        });
        return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'pedidos');
        return [];
      }
    } else {
      let list = getLocalData<Order[]>(LOCAL_STORAGE_KEYS.ORDERS, []);
      if (userId) {
        list = list.filter(o => o.userId === userId);
      }
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  },

  async saveOrder(order: Order): Promise<void> {
    if (isFirestoreActive(order.userId)) {
      try {
        await setDoc(doc(db, 'pedidos', order.id), order);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `pedidos/${order.id}`);
      }
    } else {
      const orders = await this.getOrders();
      const index = orders.findIndex(o => o.id === order.id);
      if (index >= 0) {
        orders[index] = order;
      } else {
        orders.push(order);
      }
      setLocalData(LOCAL_STORAGE_KEYS.ORDERS, orders);
    }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    if (isFirestoreActive()) {
      try {
        await updateDoc(doc(db, 'pedidos', orderId), { 
          status,
          updatedAt: new Date().toISOString()
        });
        
        if (status === 'entregado') {
          // Record sale log
          const orderDoc = await getDoc(doc(db, 'pedidos', orderId));
          if (orderDoc.exists()) {
            const orderObj = orderDoc.data() as Order;
            await this.recordSale({
              id: 'sale-' + orderId,
              pedidoId: orderId,
              total: orderObj.total,
              date: new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `pedidos/${orderId}`);
      }
    } else {
      const orders = await this.getOrders();
      const index = orders.findIndex(o => o.id === orderId);
      if (index >= 0) {
        orders[index].status = status;
        orders[index].updatedAt = new Date().toISOString();
        if (status === 'entregado') {
          // Record sale log
          await this.recordSale({
            id: 'sale-' + orderId,
            pedidoId: orderId,
            total: orders[index].total,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          });
        }
        setLocalData(LOCAL_STORAGE_KEYS.ORDERS, orders);
      }
    }
  },

  // 4. HISTORICAL SALES OPERATIONS
  async getSales(): Promise<Sale[]> {
    if (isFirestoreActive()) {
      try {
        const querySnapshot = await getDocs(collection(db, 'ventas'));
        const list: Sale[] = [];
        querySnapshot.forEach((doc) => {
          list.push(doc.data() as Sale);
        });
        return list;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'ventas');
        return [];
      }
    } else {
      return getLocalData<Sale[]>(LOCAL_STORAGE_KEYS.SALES, []);
    }
  },

  async recordSale(sale: Sale): Promise<void> {
    if (isFirestoreActive()) {
      try {
        await setDoc(doc(db, 'ventas', sale.id), sale);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `ventas/${sale.id}`);
      }
    } else {
      const sales = await this.getSales();
      if (!sales.some(s => s.id === sale.id)) {
        sales.push(sale);
        setLocalData(LOCAL_STORAGE_KEYS.SALES, sales);
      }
    }
  },

  // 5. CANCELLED ORDERS OPERATIONS
  async getCancelledOrders(): Promise<CancelledOrder[]> {
    if (isFirestoreActive()) {
      try {
        const querySnapshot = await getDocs(collection(db, 'pedidos_cancelados'));
        const list: CancelledOrder[] = [];
        querySnapshot.forEach((doc) => {
          list.push(doc.data() as CancelledOrder);
        });
        return list;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'pedidos_cancelados');
        return [];
      }
    } else {
      return getLocalData<CancelledOrder[]>(LOCAL_STORAGE_KEYS.CANCELLED, []);
    }
  },

  async recordCancelledOrder(cancelRecord: CancelledOrder): Promise<void> {
    if (isFirestoreActive()) {
      try {
        await setDoc(doc(db, 'pedidos_cancelados', cancelRecord.id), cancelRecord);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `pedidos_cancelados/${cancelRecord.id}`);
      }
    } else {
      const records = await this.getCancelledOrders();
      records.push(cancelRecord);
      setLocalData(LOCAL_STORAGE_KEYS.CANCELLED, records);
    }
  }
};
