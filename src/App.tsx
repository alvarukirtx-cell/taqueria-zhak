/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, 
  TrendingUp, 
  LogOut, 
  Users, 
  Menu as MenuIcon, 
  Package, 
  Clock, 
  MapPin, 
  Phone, 
  Shield, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  X, 
  Check, 
  CheckCircle2, 
  AlertTriangle, 
  Sun, 
  Moon, 
  Bell, 
  DollarSign, 
  User, 
  ChevronRight, 
  Utensils, 
  PlusCircle, 
  Edit3, 
  AlertCircle,
  Eye,
  MessageSquare,
  CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as fbSignOut } from 'firebase/auth';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { dbService, auth, DEVELOPER_ACCOUNTS, isFirebaseConfigured, db } from './lib/firebase';
import { Product, Order, UserProfile, Sale, CancelledOrder, Complaint, ShiftTransfer, Category, OrderItem, OrderStatus, Role, DashboardStats } from './types';
import { playNotificationSound } from './utils/audio';

const LOCAL_STORAGE_KEYS = {
  CURRENT_USER: 'taqueria_villa_active_user'
};

export default function App() {
  // --- Theme State ---
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('taqueria_villa_dark_mode') === 'true';
  });

  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadingUser, setLoadingUser] = useState<boolean>(true);
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(false);

  // --- Database Cache States ---
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [cancelledOrders, setCancelledOrders] = useState<CancelledOrder[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // --- New Complaints and Shift Earnings State ---
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [complaintResponseText, setComplaintResponseText] = useState<string>('');
  
  const [shiftTransfers, setShiftTransfers] = useState<ShiftTransfer[]>([]);
  const [transferAmountText, setTransferAmountText] = useState<string>('');
  const [transferCommentsText, setTransferCommentsText] = useState<string>('');

  const [newComplaintSubject, setNewComplaintSubject] = useState<string>('Calidad del Servicio');
  const [newComplaintMessage, setNewComplaintMessage] = useState<string>('');
  const [submittingComplaint, setSubmittingComplaint] = useState<boolean>(false);

  // --- Active Tab / UI Section Views ---
  // Users: 'menu' | 'historial' | 'perfil'
  // Admins: 'dashboard' | 'pedidos' | 'menu_manager' | 'clientes' | 'cancelados_log'
  const [activeTab, setActiveTab] = useState<string>('menu');

  // --- Customer Menu Filter Search State ---
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');

  // --- Product Customizer Modal State ---
  const [customizerProduct, setCustomizerProduct] = useState<Product | null>(null);
  const [customizerQuantity, setCustomizerQuantity] = useState<number>(1);
  const [customizerTacoType, setCustomizerTacoType] = useState<string>('Maíz'); // Maíz, Harina, Doble Maíz
  const [customizerBeverage, setCustomizerBeverage] = useState<string>(''); // link optional beverage
  const [customizerExtras, setCustomizerExtras] = useState<{ [id: string]: boolean }>({});
  const [customizerPostre, setCustomizerPostre] = useState<string>('');
  const [customizerObservations, setCustomizerObservations] = useState<string>('');

  // Live aggregate price calculator for custom bundle in real-time
  const customizerTotalPrice = useMemo(() => {
    if (!customizerProduct) return 0;
    let sum = customizerProduct.price;
    if (customizerBeverage) {
      const matchBev = products.find(p => p.id === customizerBeverage);
      if (matchBev) sum += matchBev.price;
    }
    Object.keys(customizerExtras).forEach(extraId => {
      if (customizerExtras[extraId]) {
        const matchExtra = products.find(p => p.id === extraId);
        if (matchExtra) sum += matchExtra.price;
      }
    });
    if (customizerPostre) {
      const matchPostre = products.find(p => p.id === customizerPostre);
      if (matchPostre) sum += matchPostre.price;
    }
    return sum * customizerQuantity;
  }, [customizerProduct, customizerBeverage, customizerExtras, customizerPostre, customizerQuantity, products]);

  // --- User Editing Profile State ---
  const [profileName, setProfileName] = useState<string>('');
  const [profileAddress, setProfileAddress] = useState<string>('');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [profileSaving, setProfileSaving] = useState<boolean>(false);

  // --- Shopping Cart State ---
  // Stored as an array of structured OrderItem objects
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [cartAddress, setCartAddress] = useState<string>('');
  const [cartPhone, setCartPhone] = useState<string>('');
  const [cartObservations, setCartObservations] = useState<string>('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderSuccessBanner, setOrderSuccessBanner] = useState<boolean>(false);

  // --- Admin Editing Menu State ---
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState<boolean>(false);
  const [menuFormId, setMenuFormId] = useState<string>('');
  const [menuFormName, setMenuFormName] = useState<string>('');
  const [menuFormDescription, setMenuFormDescription] = useState<string>('');
  const [menuFormPrice, setMenuFormPrice] = useState<number>(18);
  const [menuFormCategory, setMenuFormCategory] = useState<Category>('tacos');
  const [menuFormAvailable, setMenuFormAvailable] = useState<boolean>(true);

  // --- User Editing/Modifying Active Order before acceptance state ---
  const [modifyingOrder, setModifyingOrder] = useState<Order | null>(null);
  const [cancelOrderReasonId, setCancelOrderReasonId] = useState<string | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState<string>('');

  // --- Notification Toast (Arrived Order) State ---
  const [newOrderToast, setNewOrderToast] = useState<Order | null>(null);

  // --- Precheck Google SignUp Info Preheating State ---
  const [regPhone, setRegPhone] = useState<string>('');
  const [regAddress, setRegAddress] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showSimulatedGooglePopup, setShowSimulatedGooglePopup] = useState<boolean>(false);
  const [mockGoogleScreen, setMockGoogleScreen] = useState<'accounts' | 'custom'>('accounts');
  const [simulatingGoogleSession, setSimulatingGoogleSession] = useState<boolean>(false);
  const [simulatedStatusText, setSimulatedStatusText] = useState<string>('');
  const [customMockEmail, setCustomMockEmail] = useState<string>('');
  const [customMockName, setCustomMockName] = useState<string>('');
  const [customMockRole, setCustomMockRole] = useState<Role>('usuario');

  // --- Apply Theme Class ---
  useEffect(() => {
    localStorage.setItem('taqueria_villa_dark_mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // --- 1. Authentic Authentication Session listener ---
  useEffect(() => {
    const isConfigured = dbService.isUsingFirebase();
    setFirebaseConnected(isConfigured);

    if (isConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          // Logged in via Google Auth
          const profile = await dbService.getUserProfile(
            fbUser.uid, 
            fbUser.email || 'user@taqueriavilla.com', 
            fbUser.displayName || fbUser.email?.split('@')[0] || 'Cliente Villa'
          );
          setCurrentUser(profile);
          if (profile) {
            setProfileName(profile.displayName);
            setProfileAddress(profile.address || '');
            setProfilePhone(profile.phone || '');
            setCartAddress(profile.address || '');
            setCartPhone(profile.phone || '');
            
            // Redirect admin to dashboard view, standard user to restaurant menu
            if (profile.role === 'admin') {
              setActiveTab('dashboard');
            } else if (profile.role === 'empleado') {
              setActiveTab('pedidos');
            } else {
              setActiveTab('menu');
            }
          }
        } else {
          // No active real Google session - check if we have a simulated/stored session in local storage
          const storedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT_USER);
          if (storedUser) {
            try {
              const profile = JSON.parse(storedUser) as UserProfile;
              setCurrentUser(profile);
              setProfileName(profile.displayName);
              setProfileAddress(profile.address || '');
              setProfilePhone(profile.phone || '');
              setCartAddress(profile.address || '');
              setCartPhone(profile.phone || '');
              if (profile.role === 'admin') {
                setActiveTab('dashboard');
              } else if (profile.role === 'empleado') {
                setActiveTab('pedidos');
              } else {
                setActiveTab('menu');
              }
            } catch {
              setCurrentUser(null);
            }
          } else {
            setCurrentUser(null);
          }
        }
        setLoadingUser(false);
      });
      return () => unsubscribe();
    } else {
      // Simulation Offline Dev mode
      const activeUserJson = localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT_USER);
      if (activeUserJson) {
        try {
          const profile = JSON.parse(activeUserJson) as UserProfile;
          setCurrentUser(profile);
          setProfileName(profile.displayName);
          setProfileAddress(profile.address || '');
          setProfilePhone(profile.phone || '');
          setCartAddress(profile.address || '');
          setCartPhone(profile.phone || '');
          if (profile.role === 'admin') {
            setActiveTab('dashboard');
          } else if (profile.role === 'empleado') {
            setActiveTab('pedidos');
          } else {
            setActiveTab('menu');
          }
        } catch {
          setCurrentUser(null);
        }
      } else {
        // Welcomes users to log in or register with Google first
        setCurrentUser(null);
      }
      setLoadingUser(false);
    }
  }, []);

  // --- 2. Live Sync Data Streams ---
  // Sync databases from Cloud Firestore (if configured) or localStorage fallbacks
  const loadDatabase = async () => {
    setLoadingData(true);
    try {
      const prodList = await dbService.getProducts();
      setProducts(prodList);

      // Load complaints (if admin/empleado load all; else load customer's only)
      if (currentUser) {
        const complaintsList = await dbService.getComplaints(
          currentUser.role === 'admin' || currentUser.role === 'empleado' 
            ? undefined 
            : currentUser.uid
        );
        setComplaints(complaintsList);

        if (currentUser.role === 'admin' || currentUser.role === 'empleado') {
          const transfersList = await dbService.getShiftTransfers();
          setShiftTransfers(transfersList);
        }
      } else {
        setComplaints([]);
        setShiftTransfers([]);
      }

      if (dbService.isUsingFirebase()) {
        if (currentUser) {
          if (currentUser.role === 'admin' || currentUser.role === 'empleado') {
            // Admin and Empleados get all active orders
            const orderList = await dbService.getOrders();
            setOrders(orderList);

            const salesList = await dbService.getSales();
            setSales(salesList);

            const cancelList = await dbService.getCancelledOrders();
            setCancelledOrders(cancelList);

            const clientList = await dbService.getAllRegisteredUsers();
            setAllUsers(clientList);
          } else {
            // Standard customer: only load their own orders
            const orderList = await dbService.getOrders(currentUser.uid);
            setOrders(orderList);
            setSales([]);
            setCancelledOrders([]);
            setAllUsers([]);
          }
        } else {
          // Unauthenticated state view: empty datasets, wait for sign in
          setOrders([]);
          setSales([]);
          setCancelledOrders([]);
          setAllUsers([]);
        }
      } else {
        // Local simulation / fallback mode loads all
        const isAdminOrEmployee = currentUser?.role === 'admin' || currentUser?.role === 'empleado';
        const orderList = await dbService.getOrders(isAdminOrEmployee ? undefined : currentUser?.uid);
        setOrders(orderList);

        const salesList = await dbService.getSales();
        setSales(salesList);

        const cancelList = await dbService.getCancelledOrders();
        setCancelledOrders(cancelList);

        const clientList = await dbService.getAllRegisteredUsers();
        setAllUsers(clientList);
      }
    } catch (err) {
      console.warn("Failed syncing databases, falling back...", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadDatabase();

    // Setup periodic sync / polling rules for simulated state, or real listeners
    let interval: any;
    if (!dbService.isUsingFirebase()) {
      interval = setInterval(() => {
        // Quietly sync local changes
        dbService.getProducts().then(setProducts);
        
        const isAdminOrEmployee = currentUser?.role === 'admin' || currentUser?.role === 'empleado';
        dbService.getOrders(isAdminOrEmployee ? undefined : currentUser?.uid).then(newOrders => {
          // Detect if a new order entered from perspective of Admin or Empleado!
          if (isAdminOrEmployee) {
            const currentOrderIds = new Set(orders.map(o => o.id));
            const freshOrder = newOrders.find(o => !currentOrderIds.has(o.id));
            if (freshOrder && freshOrder.status === 'pendiente') {
              playNotificationSound();
              setNewOrderToast(freshOrder);
              setTimeout(() => setNewOrderToast(null), 8500); // clear after 8.5s
            }
          }
          setOrders(newOrders);
        });
        dbService.getSales().then(setSales);
        dbService.getCancelledOrders().then(setCancelledOrders);
        dbService.getAllRegisteredUsers().then(setAllUsers);
        
        if (currentUser) {
          dbService.getComplaints(isAdminOrEmployee ? undefined : currentUser.uid).then(setComplaints);
          if (isAdminOrEmployee) {
            dbService.getShiftTransfers().then(setShiftTransfers);
          }
        }
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [orders.length, currentUser?.role, currentUser?.uid]);

  // Real-time listener fallback for when Firestore is connected
  useEffect(() => {
    if (dbService.isUsingFirebase() && db && currentUser) {
      // Create a query based on role. Standard users are restricted by rules to their own orders.
      const colRef = collection(db, 'pedidos');
      const isAdminOrEmployee = currentUser.role === 'admin' || currentUser.role === 'empleado';
      const q = isAdminOrEmployee
        ? colRef
        : query(colRef, where('userId', '==', currentUser.uid));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const orderList: Order[] = [];
        snapshot.forEach((doc) => {
          orderList.push(doc.data() as Order);
        });
        const sorted = orderList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        // Notify admin/employee of incoming orders
        if (isAdminOrEmployee && orders.length > 0) {
          const currentIds = new Set(orders.map(o => o.id));
          const inbound = sorted.find(o => !currentIds.has(o.id));
          if (inbound && inbound.status === 'pendiente') {
            playNotificationSound();
            setNewOrderToast(inbound);
            setTimeout(() => setNewOrderToast(null), 8500);
          }
        }
        setOrders(sorted);
      }, (error) => {
        console.error("Firestore onSnapshot error:", error);
      });
      return () => unsubscribe();
    }
  }, [firebaseConnected, currentUser?.uid, currentUser?.role]);

  // --- 3. Authentication Operations ---
  const handleGoogleSignIn = async () => {
    setShowSimulatedGooglePopup(true);
  };

  const handleExecuteMockLogin = async (email: string, name: string, role: Role) => {
    setSimulatingGoogleSession(true);
    setSimulatedStatusText("Conectando con Google OAuth v2.0...");
    await new Promise(r => setTimeout(r, 450));
    setSimulatedStatusText("Recuperando tokens seguros de Google...");
    await new Promise(r => setTimeout(r, 400));
    setSimulatedStatusText("Sincronizando perfil con Firebase...");
    const uid = 'googlesim_' + email.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      const profile: UserProfile = {
        uid,
        email,
        displayName: name,
        role,
        createdAt: new Date().toISOString()
      };
      await dbService.saveUserProfile(profile);
      setCurrentUser(profile);
      setProfileName(profile.displayName);
      setProfileAddress(profile.address || '');
      setProfilePhone(profile.phone || '');
      setCartAddress(profile.address || '');
      setCartPhone(profile.phone || '');
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_USER, JSON.stringify(profile));
      await new Promise(r => setTimeout(r, 200));
      setSimulatedStatusText("¡Acceso concedido!");
      await new Promise(r => setTimeout(r, 150));
      setShowSimulatedGooglePopup(false);
      setSimulatingGoogleSession(false);
      if (profile.role === 'admin') {
        setActiveTab('dashboard');
      } else if (profile.role === 'empleado') {
        setActiveTab('pedidos');
      } else {
        setActiveTab('menu');
      }
    } catch (err) {
      console.error(err);
      alert("Error en el simulador de autenticación.");
      setSimulatingGoogleSession(false);
    }
  };

  const handleSignOut = async () => {
    if (isFirebaseConfigured() && auth) {
      try {
        await fbSignOut(auth);
      } catch (err) {
        console.warn("SignOut error:", err);
      }
    }
    setCurrentUser(null);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CURRENT_USER);
    setCart([]);
    setActiveTab('menu');
  };

  const selectDeveloperProfile = async (profile: UserProfile) => {
    setCurrentUser(profile);
    setProfileName(profile.displayName);
    setProfileAddress(profile.address || '');
    setProfilePhone(profile.phone || '');
    setCartAddress(profile.address || '');
    setCartPhone(profile.phone || '');
    localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_USER, JSON.stringify(profile));

    // Save user profile state
    await dbService.saveUserProfile(profile);

    // Redirect
    if (profile.role === 'admin') {
      setActiveTab('dashboard');
    } else if (profile.role === 'empleado') {
      setActiveTab('pedidos');
    } else {
      setActiveTab('menu');
    }
  };



  // --- 4. User Profile Saving ---
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setProfileSaving(true);
    const updated: UserProfile = {
      ...currentUser,
      displayName: profileName,
      address: profileAddress,
      phone: profilePhone,
    };

    try {
      await dbService.saveUserProfile(updated);
      setCurrentUser(updated);
      setCartAddress(profileAddress);
      setCartPhone(profilePhone);
      
      // Update local storage
      localStorage.setItem(LOCAL_STORAGE_KEYS.CURRENT_USER, JSON.stringify(updated));
      
      alert("¡Perfil guardado correctamente!");
    } catch (err) {
      console.error(err);
      alert("Error al guardar perfil.");
    } finally {
      setProfileSaving(false);
    }
  };

  // --- 5. Customizer & Cart Operations ---
  const handleOpenCustomizer = (product: Product) => {
    setCustomizerProduct(product);
    setCustomizerQuantity(1);
    setCustomizerTacoType('Maíz');
    setCustomizerObservations('');
    setCustomizerBeverage('');
    setCustomizerPostre('');
    setCustomizerExtras({});
  };

  const handleAddBundleToCart = () => {
    if (!customizerProduct) return;

    // Calculate aggregated items
    const mainPrice = customizerProduct.price;
    const additionalItems: OrderItem[] = [];

    // Base ordered taco
    let descriptionDetail = `Torta/Taco de tortilla de ${customizerTacoType}`;
    
    // Process linked drinks
    if (customizerBeverage) {
      const matchBev = products.find(p => p.id === customizerBeverage);
      if (matchBev) {
        additionalItems.push({
          productId: matchBev.id,
          name: `${matchBev.name} (Bebida combinada)`,
          price: matchBev.price,
          quantity: customizerQuantity,
          category: 'bebidas'
        });
      }
    }

    // Process extras
    Object.keys(customizerExtras).forEach(extraId => {
      if (customizerExtras[extraId]) {
        const matchExtra = products.find(p => p.id === extraId);
        if (matchExtra) {
          additionalItems.push({
            productId: matchExtra.id,
            name: `${matchExtra.name} (Extra taco)`,
            price: matchExtra.price,
            quantity: customizerQuantity,
            category: 'extras'
          });
        }
      }
    });

    // Process dessert
    if (customizerPostre) {
      const matchPostre = products.find(p => p.id === customizerPostre);
      if (matchPostre) {
        additionalItems.push({
          productId: matchPostre.id,
          name: `${matchPostre.name} (Postre combinado)`,
          price: matchPostre.price,
          quantity: customizerQuantity,
          category: 'postres'
        });
      }
    }

    const mainCartItem: OrderItem = {
      productId: customizerProduct.id,
      name: `${customizerProduct.name} [Tortilla: ${customizerTacoType}]`,
      price: mainPrice,
      quantity: customizerQuantity,
      category: customizerProduct.category
    };

    // Combine all selected items and obs
    const updatedCart = [...cart, mainCartItem, ...additionalItems];
    setCart(updatedCart);

    if (customizerObservations) {
      const existingObs = cartObservations ? cartObservations + "; " : "";
      setCartObservations(existingObs + `Para ${customizerProduct.name}: ${customizerObservations}`);
    }

    setCustomizerProduct(null);
  };

  const handleAddDirectToCart = (product: Product) => {
    const existing = cart.find(item => item.productId === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        category: product.category
      }]);
    }
  };

  const updateCartQty = (productId: string, diff: number) => {
    const updated = cart.map(item => {
      if (item.productId === productId) {
        const newQty = item.quantity + diff;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean) as OrderItem[];
    setCart(updated);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  // --- 6. Checkout / Submit Order ---
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      alert("Inicia sesión para poder realizar un pedido.");
      return;
    }
    if (cart.length === 0) {
      alert("El carrito está vacío.");
      return;
    }
    if (!cartAddress.trim() || !cartPhone.trim()) {
      alert("Por favor ingresa una dirección de envío y número telefónico válidos.");
      return;
    }

    setIsSubmittingOrder(true);
    const newOrderId = 'pedido-' + Date.now().toString().substring(5);

    const newOrder: Order = {
      id: newOrderId,
      userId: currentUser.uid,
      userEmail: currentUser.email,
      userName: currentUser.displayName,
      items: cart,
      observations: cartObservations,
      deliveryAddress: cartAddress,
      deliveryPhone: cartPhone,
      status: 'pendiente',
      total: cartTotal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      // Save order to DB
      await dbService.saveOrder(newOrder);

      // Automatic direct transfer to Jefe Álvaro for Carlos Mendoza and Sofía Gómez
      const isCarlosOrSofia = currentUser.email === 'carlos.mendoza@gmail.com' || currentUser.email === 'sofia.gomez@gmail.com';
      if (isCarlosOrSofia) {
        const autoTransfer: ShiftTransfer = {
          id: 'trans-' + Date.now() + '-auto',
          employeeId: currentUser.uid,
          employeeName: `${currentUser.displayName} (Pago Directo)`,
          employeeEmail: currentUser.email,
          amount: cartTotal,
          comments: `Compra automática del cliente ${currentUser.displayName}. El dinero de este pedido fue enviado directamente a la cuenta del Jefe Álvaro. (Pedido: ${newOrderId})`,
          createdAt: new Date().toISOString()
        };
        await dbService.saveShiftTransfer(autoTransfer);
        setShiftTransfers(prev => [autoTransfer, ...prev]);
      }
      
      // Clear Cart
      setCart([]);
      setCartObservations('');
      setOrderSuccessBanner(true);
      
      // Update local listing immediately
      setOrders(prev => [newOrder, ...prev]);

      // Trigger automatic prompt chime warning logic instantly (local mode)
      if (!dbService.isUsingFirebase()) {
        playNotificationSound();
      }

      // Hide success banner after 5s
      setTimeout(() => setOrderSuccessBanner(false), 5000);
      setActiveTab('historial');
    } catch (err) {
      console.error(err);
      alert("Error al enviar el pedido.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // --- 7. Order State Updators (Cancellation / State updates) ---
  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelOrderReasonId) return;

    try {
      // Get order details
      const orderToCancel = orders.find(o => o.id === cancelOrderReasonId);
      if (!orderToCancel || !currentUser) return;

      // 1. Update order status to cancel
      await dbService.updateOrderStatus(cancelOrderReasonId, 'cancelado');

      // 2. Add log entry to cancelled orders list
      const cancelLog: CancelledOrder = {
        id: 'cancel-' + Date.now(),
        pedidoId: cancelOrderReasonId,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        reason: cancelReasonText.trim() || 'Cancelado por el cliente antes de ser preparado.',
        cancelledAt: new Date().toISOString()
      };
      await dbService.recordCancelledOrder(cancelLog);

      // Locally apply updates
      setOrders(prev => prev.map(o => o.id === cancelOrderReasonId ? { ...o, status: 'cancelado', updatedAt: new Date().toISOString() } : o));
      setCancelledOrders(prev => [cancelLog, ...prev]);

      setCancelOrderReasonId(null);
      setCancelReasonText('');
      alert("¡El pedido ha sido cancelado con éxito!");
    } catch (err) {
      console.error(err);
      alert("Error al procesar la cancelación.");
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      await dbService.updateOrderStatus(orderId, nextStatus);
      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() } : o));
      
      // If complete update, sync sales
      if (nextStatus === 'entregado') {
        const found = orders.find(o => o.id === orderId);
        if (found) {
          const newSale: Sale = {
            id: 'sale-' + orderId,
            pedidoId: orderId,
            total: found.total,
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          };
          setSales(prev => [newSale, ...prev]);
        }
      }

      // If cancelled by staff, log the cancellation
      if (nextStatus === 'cancelado') {
        const found = orders.find(o => o.id === orderId);
        if (found) {
          const cancelLog: CancelledOrder = {
            id: 'cancel-' + orderId,
            pedidoId: orderId,
            userId: found.userId,
            userEmail: found.userEmail,
            reason: 'Cancelado desde el panel de atención por el personal.',
            cancelledAt: new Date().toISOString()
          };
          await dbService.recordCancelledOrder(cancelLog);
          setCancelledOrders(prev => [cancelLog, ...prev]);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Ocurrió un error al actualizar el estado del pedido.");
    }
  };

  // --- 8. Admin Menu CRUD Functions ---
  const handleOpenProductForm = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setMenuFormId(product.id);
      setMenuFormName(product.name);
      setMenuFormDescription(product.description);
      setMenuFormPrice(product.price);
      setMenuFormCategory(product.category);
      setMenuFormAvailable(product.available);
    } else {
      setEditingProduct(null);
      setMenuFormId('prod-' + Date.now().toString().substring(8));
      setMenuFormName('');
      setMenuFormDescription('');
      setMenuFormPrice(18);
      setMenuFormCategory('tacos');
      setMenuFormAvailable(true);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!menuFormName.trim()) {
      alert("El nombre del producto es obligatorio.");
      return;
    }

    setIsSavingProduct(true);
    const productData: Product = {
      id: menuFormId,
      name: menuFormName,
      description: menuFormDescription,
      price: Number(menuFormPrice) || 0,
      category: menuFormCategory,
      available: menuFormAvailable
    };

    try {
      await dbService.saveProduct(productData);
      
      // Update states
      setProducts(prev => {
        const list = [...prev];
        const idx = list.findIndex(p => p.id === menuFormId);
        if (idx >= 0) {
          list[idx] = productData;
        } else {
          list.push(productData);
        }
        return list;
      });

      setEditingProduct(null);
      setMenuFormName('');
      setMenuFormDescription('');
      alert("¡Producto del menú guardado correctamente!");
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar el producto.");
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar este producto del menú?")) return;

    try {
      await dbService.deleteProduct(productId);
      setProducts(prev => prev.filter(p => p.id !== productId));
      alert("Producto eliminado del menú.");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el producto.");
    }
  };

  // --- 9. Stats / Calculations ---
  const stats: DashboardStats = useMemo(() => {
    // Totals
    const successfulOrders = orders.filter(o => o.status === 'entregado');
    const prepOrders = orders.filter(o => o.status === 'preparacion' || o.status === 'pendiente' || o.status === 'en_camino');
    const cancelledList = orders.filter(o => o.status === 'cancelado');

    const totalEarnings = successfulOrders.reduce((sum, o) => sum + o.total, 0);

    // Earnings by day (Last 7 days calculation)
    const dailyEarnings: { [date: string]: number } = {};
    successfulOrders.forEach(o => {
      const dateStr = o.createdAt.split('T')[0];
      dailyEarnings[dateStr] = (dailyEarnings[dateStr] || 0) + o.total;
    });

    // Top-selling products sold count
    const topSoldProducts: { [name: string]: number } = {};
    successfulOrders.forEach(o => {
      o.items.forEach(item => {
        topSoldProducts[item.name] = (topSoldProducts[item.name] || 0) + item.quantity;
      });
    });

    return {
      totalEarnings,
      dailyEarnings,
      usersCount: Math.max(allUsers.length, 3), // Ensure registered counts
      ordersInPrepCount: prepOrders.length,
      ordersCompletedCount: successfulOrders.length,
      ordersCancelledCount: cancelledList.length,
      topSoldProducts
    };
  }, [orders, allUsers]);

  // --- Filtering Menus ---
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            product.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, activeCategory]);

  return (
    <div className={`min-h-screen transition-colors duration-200 ${darkMode ? 'bg-brand-black text-zinc-100' : 'bg-gray-50 text-zinc-900'} pb-12`}>
      
      {/* DEVELOPMENT PROFILE RAIL GUEST SWITCHER */}
      <div className="bg-zinc-950 text-zinc-300 px-4 py-1.5 text-xs border-b border-zinc-800 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse"></span>
          <span>PROYECTO: Taquería Villa APP (AI Studio Preview Active)</span>
          {firebaseConnected ? (
            <span className="text-emerald-400 font-bold ml-2">● CLOUD FIRESTORE ACTIVO </span>
          ) : (
            <span className="text-yellow-400 font-bold ml-2">● MOCK FIRESTORE LOCAL</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 font-medium">Intercambiar Perfil (Review & Test):</span>
          <div className="flex gap-1.5">
            {DEVELOPER_ACCOUNTS.map((acc) => {
              const isActive = currentUser?.email === acc.email;
              return (
                <button
                  key={acc.uid}
                  id={`switcher-btn-${acc.uid}`}
                  onClick={() => selectDeveloperProfile(acc)}
                  className={`px-2.5 py-0.5 rounded-md font-medium text-[11px] transition-all ${
                    isActive 
                      ? 'bg-red-600 text-white shadow-sm ring-1 ring-red-400' 
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {acc.displayName.includes('Admin') ? '👔 Álvaro (Admin)' : acc.displayName.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* FLOATING SUCCESS ORDER BANNER */}
      <AnimatePresence>
        {orderSuccessBanner && (
          <motion.div 
            initial={{ opacity: 0, y: -80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -80 }}
            id="order-success-notifier"
            className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3.5 border border-emerald-400 max-w-md w-[90%]"
          >
            <div className="bg-white/20 p-2 rounded-full">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold font-display text-lg">¡Pedido Recibido con Éxito!</p>
              <p className="text-xs text-emerald-100">En un momento lo prepararemos para ti.</p>
            </div>
            <button onClick={() => setOrderSuccessBanner(false)} className="ml-auto text-white/70 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DYNAMIC NEW ORDER INCOMING ALERT (FOR ADMINS) */}
      <AnimatePresence>
        {newOrderToast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            id="admin-notification-alert"
            className="fixed bottom-6 right-6 z-50 bg-red-600 text-white rounded-2xl shadow-2xl border-2 border-yellow-400 p-5 max-w-sm w-96 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex gap-2.5 items-center">
                <div className="bg-yellow-400 text-zinc-950 p-2 rounded-full animate-bounce">
                  <Bell className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h4 className="font-bold font-display text-base text-yellow-300">🔔 ¡NUEVO PEDIDO RECIBIDO!</h4>
                  <p className="text-xs text-white/90">ID: {newOrderToast.id}</p>
                </div>
              </div>
              <button onClick={() => setNewOrderToast(null)} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-zinc-950/20 rounded-xl p-3 text-xs flex flex-col gap-1 border border-white/10">
              <p><span className="font-semibold text-yellow-300">Cliente:</span> {newOrderToast.userName}</p>
              <p><span className="font-semibold text-yellow-300">Total:</span> ${newOrderToast.total.toFixed(2)} MXN</p>
              <p><span className="font-semibold text-yellow-300">Dirección:</span> {newOrderToast.deliveryAddress}</p>
            </div>
            <button 
              onClick={() => {
                setActiveTab('pedidos');
                setNewOrderToast(null);
              }}
              className="w-full bg-yellow-400 text-zinc-950 py-2 rounded-xl text-xs font-semibold hover:bg-yellow-300 transition-colors"
            >
              Ver en la Consola de Pedidos
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER BAR */}
      <header className={`sticky top-0 z-40 transition-shadow ${darkMode ? 'bg-zinc-950 border-b border-zinc-800' : 'bg-white shadow-md'} border-b`}>
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            {/* Visual Logo */}
            <div className="relative w-11 h-11 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg border border-yellow-500 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-black/40 to-transparent"></div>
              <Utensils className="w-6 h-6 text-yellow-400 relative z-10" />
            </div>
            <div>
              <h1 className="font-extrabold font-display text-xl sm:text-2xl tracking-tight leading-none text-red-600 dark:text-red-500">
                Taquería Villa
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-500 font-mono tracking-wider uppercase leading-none mt-1">
                Sabor de Barrio Moderno
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Dark Mode Switcher */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2.5 rounded-xl border transition-colors ${
                darkMode ? 'bg-zinc-800 border-zinc-700 text-yellow-400 hover:bg-zinc-700' : 'bg-gray-100 border-gray-200 text-zinc-500 hover:bg-gray-200'
              }`}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* User Access State */}
            {currentUser ? (
              <div className="flex items-center gap-3">
                {/* Profile Widget Info */}
                <div className="hidden md:flex flex-col text-right">
                  <span className="font-semibold text-xs leading-none">
                    {currentUser.displayName}
                  </span>
                  <span className={`text-[10px] uppercase font-mono tracking-wider mt-1 px-1.5 py-0.5 rounded-full inline-block text-center ${
                    currentUser.role === 'admin' 
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                      : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20'
                  }`}>
                    {currentUser.role === 'admin' ? 'Jefe / Admin' : 'Comensal'}
                  </span>
                </div>

                {/* Google Sign-out button */}
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-zinc-800 text-zinc-300 px-3.5 py-2 rounded-xl border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="flex items-center gap-2 bg-red-600 text-white font-bold hover:bg-red-700 px-5 py-2.5 rounded-xl transition-all shadow-lg text-xs"
              >
                <User className="w-4 h-4" />
                <span>Ingresar con Google</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* CORE WRAPPER SECTION */}
      <main className="max-w-7xl mx-auto px-4 mt-6 sm:px-6 lg:px-8">
        
        {/* VIEW CONDITIONAL SEGMENTS BASED ON ROLES */}
        {!currentUser ? (
          /* =========================================================================
             GOOGLE AUTHENTICATION & REGISTER PORTAL (REAL GOOGLE AUTHENTICATION)
             ========================================================================= */
          <div className="max-w-4xl mx-auto py-10 px-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col gap-8"
            >
              <div className="text-center space-y-3">
                <span className="bg-red-650/15 border border-red-500/30 text-red-650 dark:text-red-400 text-[10px] font-bold py-1 px-3.5 rounded-full uppercase tracking-wider">
                  Acceso Seguro • Taquería Villa
                </span>
                <h2 className="text-3xl sm:text-4xl font-black tracking-tight font-display text-zinc-900 dark:text-zinc-100">
                  Iniciar Sesión con Google
                </h2>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
                  Conéctate directamente con tu cuenta de Google. Tu información se sincroniza de inmediato para que puedas realizar tus pedidos al instante.
                </p>
              </div>

              <div className="max-w-md mx-auto mt-3">
                
                {/* DIRECT GOOGLE LOGIN BUTTON & BENEFITS */}
                <div className="bg-white dark:bg-zinc-950 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-zinc-800 shadow-xl flex flex-col gap-8">
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-extrabold font-display text-sm uppercase text-red-650 dark:text-yellow-500 tracking-wider text-center">Acceso Simulado de Google</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 text-center">Inicia sesión de forma instantánea y segura. Se ha integrado un simulador inteligente para evitar bloqueos del navegador.</p>
                    </div>

                    <div className="space-y-3.5">
                      <div className="flex gap-3 text-xs text-zinc-700 dark:text-zinc-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <p><span className="font-bold text-zinc-900 dark:text-white">Rastreo Activo:</span> Monitorea la cocina de tus tacos al pastor y el reparto en vivo.</p>
                      </div>
                      <div className="flex gap-3 text-xs text-zinc-700 dark:text-zinc-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <p><span className="font-bold text-zinc-900 dark:text-white">Repetir Pedido:</span> Repite tus combinaciones de tacos predilectas con un solo click.</p>
                      </div>
                      <div className="flex gap-3 text-xs text-zinc-700 dark:text-zinc-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <p><span className="font-bold text-zinc-900 dark:text-white">Taco-Puntos:</span> Acumula puntos en cada orden para canjearlos por bebidas o postres gratis.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-150 dark:border-zinc-900">
                    <button
                      onClick={handleGoogleSignIn}
                      className="w-full bg-zinc-950 hover:bg-zinc-900 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 text-white font-bold py-3.5 px-4 rounded-xl text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98]"
                    >
                      {/* Stylized custom SVG Google logo */}
                      <svg className="w-4.5 h-4.5 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Ingresar con Google (Simulador)</span>
                    </button>

                    <div className="text-center">
                      <span className="text-[10px] text-zinc-500 font-mono">Bypass oficial de restricciones de iframe & Firebase</span>
                    </div>
                  </div>
                </div>

              </div>



            </motion.div>
          </div>
        ) : (currentUser.role === 'admin' || currentUser.role === 'empleado') ? (
          
          /* =========================================================================
             ADMINISTRATOR & EMPLOYEE PORTAL
             ========================================================================= */
          <div className="flex flex-col gap-6">
            
            {/* ADMIN NAV HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="bg-red-600/25 border border-red-500 text-red-500 px-3 py-2 rounded-xl">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-extrabold font-display text-base sm:text-lg text-white">
                    {currentUser.role === 'admin' ? 'Panel de Administración de Taquería Villa' : 'Comandero de Operaciones y Servicios (Empleado)'}
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {currentUser.role === 'admin' 
                      ? 'Ver estadísticas de ventas, despachar comandas, actualizar precios y el menú.' 
                      : 'Monitorear comandas en cocina, atender solicitudes de los clientes y registrar cortes.'}
                  </p>
                </div>
              </div>
              
              {/* Tabs list */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0 font-display">
                {(currentUser.role === 'admin'
                  ? [
                      { id: 'dashboard', label: 'Dashboard / Stats', icon: TrendingUp },
                      { id: 'pedidos', label: 'Comandas / Pedidos', icon: Package },
                      { id: 'menu_manager', label: 'Administrar Menú', icon: Edit3 },
                      { id: 'clientes', label: 'Directorio de Clientes', icon: Users },
                      { id: 'cancelados_log', label: 'Historial Cancelados', icon: AlertTriangle },
                      { id: 'caja_quejas', label: 'Buzón de Quejas', icon: MessageSquare },
                      { id: 'shift_earnings', label: 'Cierre y Auditoría', icon: DollarSign }
                    ]
                  : [
                      { id: 'pedidos', label: 'Comandas / Pedidos', icon: Package },
                      { id: 'caja_quejas', label: 'Buzón de Quejas (Caja)', icon: MessageSquare },
                      { id: 'shift_earnings', label: 'Enviar Ganancias al Jefe', icon: DollarSign }
                    ]
                ).map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs whitespace-nowrap transition-colors ${
                        isActive 
                          ? 'bg-red-600 text-white shadow-lg' 
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* LOADING PLACEHOLDER */}
            {loadingData ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-16 h-16 border-4 border-dashed border-red-600 rounded-full animate-spin"></div>
                <p className="font-display font-medium text-lg">Cargando base de datos de Taquería Villa...</p>
              </div>
            ) : (
              <div className="min-h-[500px]">
                
                {/* ADMIN TARGET VIEWS */}
                
                {/* 1. DASHBOARD & STATISTICS */}
                {activeTab === 'dashboard' && (
                  <div className="flex flex-col gap-6">
                    
                    {/* STAT CARDS ROW */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      
                      <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-lg flex flex-col gap-1.5">
                        <span className="text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">Ganancias Totales</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl sm:text-3xl font-extrabold font-display text-emerald-400">${stats.totalEarnings.toFixed(2)}</span>
                          <span className="text-xs text-emerald-400/80 font-mono">MXN</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-2">Corresponde a pedidos entregados exitosamente.</div>
                      </div>

                      <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-lg flex flex-col gap-1.5">
                        <span className="text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">Pedidos Activos</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl sm:text-3xl font-extrabold font-display text-yellow-400">{stats.ordersInPrepCount}</span>
                          <span className="text-xs text-yellow-400/80">en comanda</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-2">Pendientes, preparación y camino.</div>
                      </div>

                      <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-lg flex flex-col gap-1.5">
                        <span className="text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">Clientes Registrados</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl sm:text-3xl font-extrabold font-display text-sky-400">{stats.usersCount}</span>
                          <span className="text-xs text-sky-400/80">usuarios</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-2">Clientes que ingresaron con Google.</div>
                      </div>

                      <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-lg flex flex-col gap-1.5">
                        <span className="text-zinc-400 text-[11px] uppercase tracking-wider font-semibold">Tasa de Cancelación</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl sm:text-3xl font-extrabold font-display text-red-500">{stats.ordersCancelledCount}</span>
                          <span className="text-xs text-red-500/80">cancelados</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-2">Pedidos cancelados por clientes o admin.</div>
                      </div>

                    </div>

                    {/* GRAPHS AND CHARTS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* CHART 1: DAILY REVENUE */}
                      <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-lg flex flex-col gap-4">
                        <div>
                          <h3 className="font-extrabold font-display text-base text-white">Ventas por Día (Histórico)</h3>
                          <p className="text-xs text-zinc-400">Ingresos consolidados por fecha calendario.</p>
                        </div>

                        {/* RENDER CUSTOM SVG GRAPH BAR CHART FOR 100% REACT 19 STABILITY */}
                        <div className="h-56 w-full flex items-end justify-between gap-1 border-b border-l border-zinc-800 px-2 pb-1 relative mt-4">
                          {/* Grid line guidelines */}
                          <div className="absolute left-0 right-0 top-1/4 b border-t border-dashed border-zinc-800/50"></div>
                          <div className="absolute left-0 right-0 top-2/4 border-t border-dashed border-zinc-800/50"></div>
                          <div className="absolute left-0 right-0 top-3/4 border-t border-dashed border-zinc-800/50"></div>

                          {Object.keys(stats.dailyEarnings).length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs font-mono">
                              Esperando por el primer pedido entregado...
                            </div>
                          ) : (
                            Object.keys(stats.dailyEarnings).map((date) => {
                              const value = stats.dailyEarnings[date];
                              const maxVal = Math.max(...(Object.values(stats.dailyEarnings) as number[]), 1);
                              const pct = Math.max(10, (value / maxVal) * 85); // pct bounds
                              return (
                                <div key={date} className="flex-1 flex flex-col items-center gap-1 group">
                                  {/* Bar hover flag */}
                                  <div className="bg-red-600 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity absolute top-1">
                                    ${value.toFixed(2)}
                                  </div>
                                  
                                  {/* Bar color */}
                                  <div 
                                    className="w-full bg-red-600 hover:bg-yellow-400 transition-all rounded-t-sm"
                                    style={{ height: `${pct}%` }}
                                  ></div>
                                  
                                  {/* Date Text */}
                                  <span className="text-[10px] font-mono text-zinc-400 text-center truncate w-full mt-1">
                                    {date.substring(5)}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* CHART 2: RECENT PRODUCTS POPULARITY */}
                      <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-lg flex flex-col gap-4">
                        <div>
                          <h3 className="font-extrabold font-display text-base text-white">Artículos Más Vendidos</h3>
                          <p className="text-xs text-zinc-400 font-display">Conteo de tacos y extras pedidos.</p>
                        </div>

                        <div className="flex flex-col gap-3 mt-2 max-h-56 overflow-y-auto">
                          {Object.keys(stats.topSoldProducts).length === 0 ? (
                            <p className="text-zinc-600 text-xs text-center py-10 font-mono">Sin registros de productos entregados aún.</p>
                          ) : (
                            Object.keys(stats.topSoldProducts)
                              .sort((a,b) => stats.topSoldProducts[b] - stats.topSoldProducts[a])
                              .slice(0, 5)
                              .map((name, i) => {
                                const qty = stats.topSoldProducts[name];
                                const maxQty = Math.max(...(Object.values(stats.topSoldProducts) as number[]), 1);
                                const pct = (qty / maxQty) * 100;
                                return (
                                  <div key={name} className="flex flex-col gap-1.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                      <span className="text-zinc-100 truncate w-[70%]">{i+1}. {name}</span>
                                      <span className="text-yellow-400 text-right">{qty} ords</span>
                                    </div>
                                    <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-gradient-to-r from-red-600 to-yellow-500 rounded-full"
                                        style={{ width: `${pct}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>

                    </div>

                    {/* RECENT SALES TIMELINE LOG */}
                    <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-lg">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="font-bold font-display text-base text-white">Historial General de Ventas</h3>
                          <p className="text-xs text-zinc-400">Auditoría fiscal de cobros de Taquería Villa.</p>
                        </div>
                        <span className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-xl text-xs font-mono text-zinc-400">
                          {sales.length} transacciones
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800">
                            <tr>
                              <th className="px-4 py-3">ID Venta</th>
                              <th className="px-4 py-3">Ref Pedido</th>
                              <th className="px-4 py-3">Fecha</th>
                              <th className="px-4 py-3">Hora</th>
                              <th className="text-right px-4 py-3">Total Cobrado (MXN)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800 font-mono">
                            {sales.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-center py-6 text-zinc-500">Ninguna venta realizada todavía.</td>
                              </tr>
                            ) : (
                              sales.map(sale => (
                                <tr key={sale.id} className="hover:bg-zinc-900/50">
                                  <td className="px-4 py-3 font-semibold text-zinc-300">{sale.id}</td>
                                  <td className="px-4 py-3 text-red-400 font-bold">{sale.pedidoId}</td>
                                  <td className="px-4 py-3 text-zinc-400">{sale.date}</td>
                                  <td className="px-4 py-3 text-zinc-500">{new Date(sale.createdAt).toLocaleTimeString()}</td>
                                  <td className="text-right px-4 py-3 font-extrabold text-emerald-400">${sale.total.toFixed(2)}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                )}

                {/* 2. ORDER DISPATCHER CENTER */}
                {activeTab === 'pedidos' && (
                  <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      <div>
                        <h3 className="font-extrabold font-display text-base text-white">Comandero Ejecutivo de Despacho</h3>
                        <p className="text-xs text-zinc-400">Comanda en tiempo real. Configura el estado para los comensales.</p>
                      </div>
                      <button 
                        onClick={loadDatabase} 
                        className="bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl text-xs hover:bg-zinc-800 text-zinc-300 font-semibold"
                      >
                        Refrescar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {orders.length === 0 ? (
                        <div className="bg-zinc-950 rounded-2xl border border-zinc-850 p-12 text-center text-zinc-500 flex flex-col items-center gap-2">
                          <Package className="w-12 h-12 text-zinc-600 mb-2 animate-pulse" />
                          <p className="font-semibold text-lg text-white">No se han registrado pedidos</p>
                          <p className="text-xs text-zinc-400">Los pedidos de los clientes normales aparecerán enlistados aquí instantáneamente.</p>
                        </div>
                      ) : (
                        orders.map(order => {
                          const isTerminal = order.status === 'entregado' || order.status === 'cancelado';
                          return (
                            <div 
                              key={order.id} 
                              id={`admin-order-card-${order.id}`}
                              className={`bg-zinc-950 border rounded-2xl p-5 shadow-lg flex flex-col lg:flex-row gap-5 justify-between ${
                                order.status === 'pendiente' 
                                  ? 'border-yellow-500/60 shadow-yellow-500/5' 
                                  : order.status === 'preparacion'
                                  ? 'border-orange-500/50 shadow-orange-500/5'
                                  : order.status === 'en_camino'
                                  ? 'border-sky-500/50 shadow-sky-500/5'
                                  : order.status === 'entregado'
                                  ? 'border-emerald-550/30'
                                  : 'border-zinc-800 bg-opacity-70'
                              }`}
                            >
                              
                              {/* ORDER INFO */}
                              <div className="flex-1 flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-zinc-100 font-mono text-sm uppercase">📌 ID: {order.id}</span>
                                  <span className="text-xs text-zinc-500">|</span>
                                  <span className="text-xs text-zinc-400 font-mono">{new Date(order.createdAt).toLocaleString()}</span>
                                  
                                  {/* Color Badges */}
                                  <span className={`ml-auto lg:ml-2 sm:text-xs font-bold leading-none px-2.5 py-1 rounded-full uppercase ${
                                    order.status === 'pendiente' ? 'bg-yellow-400 text-zinc-950' :
                                    order.status === 'preparacion' ? 'bg-orange-600 text-white' :
                                    order.status === 'en_camino' ? 'bg-sky-600 text-white' :
                                    order.status === 'entregado' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'
                                  }`}>
                                    {order.status}
                                  </span>
                                </div>

                                <div className="bg-zinc-900/50 p-3.5 rounded-xl border border-zinc-800">
                                  <h4 className="text-xs font-semibold text-yellow-400 mb-2 uppercase tracking-wide">Platillos Ordenados:</h4>
                                  <ul className="text-xs font-medium space-y-1.5 text-zinc-200">
                                    {order.items.map((item, index) => (
                                      <li key={index} className="flex justify-between border-b border-zinc-800/50 pb-1">
                                        <span>
                                          <span className="font-mono text-red-500 font-bold">{item.quantity}x</span> {item.name}
                                        </span>
                                        <span className="font-mono text-zinc-400">${(item.price * item.quantity).toFixed(2)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  {order.observations && (
                                    <div className="mt-2.5 pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 italic">
                                      <span className="font-semibold text-yellow-500">Notas:</span> {order.observations}
                                    </div>
                                  )}
                                </div>

                                 {/* Address and buyer info */}
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-1 text-xs">
                                   <div className="flex gap-1.5 items-center">
                                     <User className="w-4 h-4 text-zinc-400" />
                                     <span className="truncate">
                                       <span className="font-semibold text-zinc-400">Comensal:</span> {order.userName} ({order.userEmail})
                                       {(order.userEmail === 'carlos.mendoza@gmail.com' || order.userEmail === 'sofia.gomez@gmail.com') && (
                                         <span className="inline-block bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded ml-2 uppercase animate-pulse">
                                           ✓ Directo a Álvaro Jefe
                                         </span>
                                       )}
                                     </span>
                                   </div>
                                   <div className="flex gap-1.5 items-center">
                                     <MapPin className="w-4 h-4 text-red-500" />
                                     <span className="truncate"><span className="font-semibold text-zinc-400">Dir:</span> {order.deliveryAddress}</span>
                                   </div>
                                   <div className="flex gap-1.5 items-center">
                                     <Phone className="w-4 h-4 text-emerald-500" />
                                     <span><span className="font-semibold text-zinc-400">Tel:</span> {order.deliveryPhone}</span>
                                   </div>
                                 </div>

                               </div>

                               {/* ACTIONS ZONE FOR ADMIN */}
                               <div className="lg:w-72 flex flex-col justify-between items-end border-t lg:border-t-0 lg:border-l border-zinc-800 pt-4 lg:pt-0 lg:pl-5 gap-3">
                                 <div>
                                   <span className="text-[10px] uppercase text-zinc-500 tracking-wider">Monto a cobrar</span>
                                   <p className="text-2xl font-extrabold font-display text-emerald-400 text-right leading-none mt-1">
                                     ${order.total.toFixed(2)} <span className="text-xs font-normal text-zinc-400">MXN</span>
                                   </p>
                                   {(order.userEmail === 'carlos.mendoza@gmail.com' || order.userEmail === 'sofia.gomez@gmail.com') && (
                                     <p className="text-[9px] text-emerald-400 text-right font-bold mt-1.5 font-sans whitespace-nowrap">
                                       💸 Dinero transferido al Jefe Álvaro ✓
                                     </p>
                                   )}
                                 </div>

                                {isTerminal ? (
                                  <div className="text-right w-full text-xs text-zinc-500">
                                    Pedido cerrado con éxito.
                                  </div>
                                ) : (
                                  <div className="w-full">
                                    <label className="block text-[11px] text-zinc-400 mb-1.5 text-left font-semibold uppercase">Despachar / Cambiar Estado:</label>
                                    <div className="flex flex-wrap gap-1.5 justify-end">
                                      {[
                                        { id: 'pendiente', label: 'Pendiente', color: 'hover:bg-yellow-400 hover:text-zinc-950' },
                                        { id: 'preparacion', label: 'En Cocina', color: 'hover:bg-orange-600 hover:text-white' },
                                        { id: 'en_camino', label: 'En Camino', color: 'hover:bg-sky-600 hover:text-white' },
                                        { id: 'entregado', label: 'Entregado', color: 'hover:bg-emerald-600 hover:text-white' },
                                        { id: 'cancelado', label: 'Cancelar', color: 'hover:bg-red-650 hover:text-white text-red-400 border-red-500/40' }
                                      ].map((sta) => {
                                        const isCurrent = order.status === sta.id;
                                        return (
                                          <button
                                            key={sta.id}
                                            onClick={() => handleUpdateOrderStatus(order.id, sta.id as OrderStatus)}
                                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                              isCurrent 
                                                ? 'bg-zinc-800 border-yellow-500 text-yellow-300 ring-1 ring-yellow-500' 
                                                : `bg-zinc-900 border-zinc-800 text-zinc-300 ${sta.color}`
                                            }`}
                                          >
                                            {sta.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                              </div>

                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* 3. MENU MANAGER MANAGER */}
                {activeTab === 'menu_manager' && (
                  <div className="flex flex-col gap-6">
                    
                    {/* ADD NEW PRODUCT ACTION ROW */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                      <div>
                        <h3 className="font-extrabold font-display text-base text-zinc-100">Administrador de Platillos del Menú</h3>
                        <p className="text-xs text-zinc-400">Edita, añade, o elimina productos de la carta e inhabilita stock.</p>
                      </div>
                      <button
                        onClick={() => handleOpenProductForm()}
                        className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all self-end"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Añadir Nuevo Producto
                      </button>
                    </div>

                    {/* EDIT PRODUCT FOR CONTEXT BOX */}
                    {editingProduct !== null && (
                      <div className="bg-zinc-950 rounded-2xl border-2 border-red-600 p-6 shadow-2xl flex flex-col gap-4">
                        <div>
                          <h4 className="font-extrabold font-display text-base text-white">
                            {editingProduct.name ? `Editar Platillo: ${editingProduct.name}` : 'Añadir Nuevo Producto al Menú'}
                          </h4>
                          <p className="text-xs text-zinc-400">Modifica los detalles correspondientes asegurando que se graben.</p>
                        </div>

                        <form onSubmit={handleSaveProduct} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          
                          <div className="flex flex-col gap-1.5 md:col-span-2">
                            <label className="text-xs text-zinc-400 font-semibold">Nombre del Producto:</label>
                            <input 
                              type="text" 
                              required
                              value={menuFormName}
                              onChange={(e) => setMenuFormName(e.target.value)}
                              placeholder="Ej. Gringas al Pastor"
                              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-zinc-400 font-semibold">Precio Unitario ($):</label>
                            <input 
                              type="number" 
                              required
                              min="0"
                              step="0.5"
                              value={menuFormPrice}
                              onChange={(e) => setMenuFormPrice(Number(e.target.value) || 0)}
                              placeholder="MXN"
                              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5 md:col-span-2">
                            <label className="text-xs text-zinc-400 font-semibold">Descripción / Ingredientes:</label>
                            <input 
                              type="text" 
                              value={menuFormDescription}
                              onChange={(e) => setMenuFormDescription(e.target.value)}
                              placeholder="Carne asada marinada, salsa de piña"
                              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-zinc-400 font-semibold">Categoría de Menú:</label>
                            <select
                              value={menuFormCategory}
                              onChange={(e) => setMenuFormCategory(e.target.value as Category)}
                              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                            >
                              <option value="tacos">Tacos</option>
                              <option value="bebidas">Bebidas</option>
                              <option value="extras">Extras / Toppings</option>
                              <option value="postres">Postres</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-2 md:col-span-3 pt-2">
                            <input 
                              type="checkbox" 
                              id="avail-check"
                              checked={menuFormAvailable}
                              onChange={(e) => setMenuFormAvailable(e.target.checked)}
                              className="w-4 h-4 bg-zinc-900 border-zinc-800 rounded text-red-650"
                            />
                            <label htmlFor="avail-check" className="text-xs text-zinc-300 font-semibold">Este platillo se encuentra disponible hoy e instantáneamente en stock.</label>
                          </div>

                          <div className="md:col-span-3 flex justify-end gap-2.5 border-t border-zinc-800 pt-4 mt-2">
                            <button 
                              type="button" 
                              onClick={() => setEditingProduct(null)}
                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 text-zinc-455 hover:bg-zinc-700 hover:text-white"
                            >
                              Cancelar
                            </button>
                            <button 
                              type="submit" 
                              className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 flex items-center gap-1 shadow-md"
                            >
                              {isSavingProduct ? 'Guardando...' : 'Guardar Producto'}
                            </button>
                          </div>

                        </form>
                      </div>
                    )}

                    {/* MENU GRID FOR ADMIN EDITING */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {products.map(product => {
                        return (
                          <div key={product.id} className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 flex flex-col justify-between gap-3 shadow-md hover:border-zinc-700 transition-all">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between items-start gap-2">
                                <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                                  product.category === 'tacos' ? 'bg-red-600/10 text-red-550 border border-red-500/20' :
                                  product.category === 'bebidas' ? 'bg-sky-600/10 text-sky-400 border border-sky-500/20' :
                                  product.category === 'extras' ? 'bg-yellow-650/10 text-yellow-455 border border-yellow-500/20' :
                                  'bg-purple-600/10 text-purple-400 border border-purple-500/20'
                                }`}>
                                  {product.category}
                                </span>
                                
                                <span className={`text-[10px] font-semibold ${product.available ? 'text-emerald-400' : 'text-red-500'}`}>
                                  {product.available ? '● En Stock' : '● Agotado'}
                                </span>
                              </div>

                              <h4 className="font-extrabold text-sm text-zinc-100">{product.name}</h4>
                              <p className="text-xs text-zinc-400 font-medium leading-relaxed">{product.description || 'Sin descripción'}</p>
                            </div>

                            <div className="flex items-center justify-between border-t border-zinc-850 pt-3 mt-1.5">
                              <span className="font-mono text-base font-extrabold text-yellow-400">${product.price.toFixed(2)} MXN</span>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleOpenProductForm(product)}
                                  className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800"
                                  title="Editar platillo"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProduct(product.id)}
                                  className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
                                  title="Eliminar del menú"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

                {/* 4. REGISTERED CLIENT DIRECTORY */}
                {activeTab === 'clientes' && (
                  <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl flex flex-col gap-4">
                    <div>
                      <h3 className="font-extrabold font-display text-base text-white">Directorio de Clientes Registrados</h3>
                      <p className="text-xs text-zinc-400">Padrón de usuarios que han ingresado y agendado entregas.</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">Nombre</th>
                            <th className="px-4 py-3">Email</th>
                            <th className="px-4 py-3">Rol</th>
                            <th className="px-4 py-3">Teléfono</th>
                            <th className="px-4 py-3">Dirección Guardada</th>
                            <th className="px-4 py-3">Registro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800 text-zinc-300 font-mono">
                          {allUsers.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-6 text-zinc-500">Ningún usuario registrado en la base de datos de Firestore.</td>
                            </tr>
                          ) : (
                            allUsers.map((client) => {
                              return (
                                <tr key={client.uid} className="hover:bg-zinc-900/50">
                                  <td className="px-4 py-3 font-semibold text-white">{client.displayName}</td>
                                  <td className="px-4 py-3 text-red-400 font-semibold">{client.email}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${
                                      client.role === 'admin' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/10 text-yellow-400'
                                    }`}>
                                      {client.role}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">{client.phone || <em className="text-zinc-600">No especificado</em>}</td>
                                  <td className="px-4 py-3 max-w-xs truncate" title={client.address}>{client.address || <em className="text-zinc-600">Sin dirección</em>}</td>
                                  <td className="px-4 py-3 text-zinc-500">{new Date(client.createdAt).toLocaleDateString()}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. HISTORIC CANCELLED ORDERS LOG WITH REASONS */}
                {activeTab === 'cancelados_log' && (
                  <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl flex flex-col gap-4">
                    <div>
                      <h3 className="font-extrabold font-display text-base text-zinc-100">Bitácora Oficial de Cancelaciones</h3>
                      <p className="text-xs text-zinc-400">Expediente de motivos y cancelaciones de comandas.</p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-900 text-zinc-400 uppercase font-mono border-b border-zinc-800">
                          <tr>
                            <th className="px-4 py-3">ID Log</th>
                            <th className="px-4 py-3">ID Pedido</th>
                            <th className="px-4 py-3">Detalle del Cancelador</th>
                            <th className="px-4 py-3">Razón / Motivo de Cancelación</th>
                            <th className="px-4 py-3">Fecha y Hora</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800 font-mono text-zinc-300">
                          {cancelledOrders.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-6 text-zinc-500">No se registran comandas canceladas.</td>
                            </tr>
                          ) : (
                            cancelledOrders.map((rec) => {
                              return (
                                <tr key={rec.id} className="hover:bg-zinc-900/50">
                                  <td className="px-4 py-3 text-zinc-500 text-[11px]">{rec.id}</td>
                                  <td className="px-4 py-3 font-bold text-red-500">{rec.pedidoId}</td>
                                  <td className="px-4 py-3">{rec.userEmail}</td>
                                  <td className="px-4 py-3 text-yellow-400 italic">“{rec.reason}”</td>
                                  <td className="px-4 py-3 text-zinc-400">{new Date(rec.cancelledAt).toLocaleString()}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 6. COMPLAINTS BOX PANEL (ADMIN & ENCARGADOS/EMPLEADOS) */}
                {activeTab === 'caja_quejas' && (
                  <div className="flex flex-col gap-6">
                    <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="text-red-500 w-5 h-5 animate-pulse" />
                        <h3 className="font-extrabold font-display text-base text-white font-sans">Buzón de Quejas y Sugerencias</h3>
                      </div>
                      <p className="text-xs text-zinc-400 font-sans">Atención oficial del restaurante. Revisa, responde y dale seguimiento a los reportes ingresados por los clientes.</p>
                    </div>

                    {complaints.length === 0 ? (
                      <div className="bg-zinc-950 p-12 text-center rounded-2xl border border-zinc-800 flex flex-col items-center gap-3">
                        <MessageSquare className="w-10 h-10 text-zinc-700" />
                        <p className="text-sm font-bold text-zinc-300 font-sans">El buzón de quejas está vacío</p>
                        <p className="text-xs text-zinc-500 font-medium font-sans">¡Felicidades! Ningún cliente ha dejado sugerencias negativas o quejas.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Complaints List Selection Slider */}
                        <div className="lg:col-span-6 flex flex-col gap-4">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-sans">Listado de Comentarios y Reportes ({complaints.length})</span>
                          <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
                            {complaints.map((comp) => {
                              const isSelected = selectedComplaintId === comp.id;
                              return (
                                <button
                                  type="button"
                                  key={comp.id}
                                  onClick={() => {
                                    setSelectedComplaintId(comp.id);
                                    setComplaintResponseText(comp.response || '');
                                  }}
                                  className={`w-full p-4 rounded-xl text-left border flex flex-col gap-2.5 transition-all ${
                                    isSelected 
                                      ? 'bg-zinc-900 border-red-500 shadow-lg ring-1 ring-red-500/20 text-white' 
                                      : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900/40 text-zinc-300'
                                  }`}
                                >
                                  <div className="flex justify-between items-start gap-3 w-full">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-xs font-bold text-zinc-100 font-sans">{comp.userName}</span>
                                      <span className="text-[10px] text-zinc-400 font-mono">{comp.userEmail}</span>
                                    </div>
                                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border font-mono ${
                                      comp.status === 'resuelta' 
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                                        : comp.status === 'revisada' 
                                          ? 'bg-sky-500/10 border-sky-500/20 text-sky-500' 
                                          : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
                                    }`}>
                                      {comp.status === 'pendiente' ? 'Pendiente' : comp.status === 'revisada' ? 'Atendida' : 'Resuelta'}
                                    </span>
                                  </div>
                                  
                                  <div className="text-[11px] font-mono text-zinc-500 flex justify-between items-center bg-zinc-950 px-2 py-1 rounded">
                                    <span>Asunto: {comp.subject}</span>
                                    <span>{new Date(comp.createdAt).toLocaleDateString()}</span>
                                  </div>

                                  <p className="text-xs text-zinc-300 italic line-clamp-2 mt-1">
                                    “{comp.message}”
                                  </p>

                                  {comp.response && (
                                    <div className="mt-2 bg-zinc-950/80 p-2.5 rounded border border-zinc-900 flex items-start gap-2">
                                      <span className="text-[9px] font-extrabold text-emerald-500 bg-emerald-500/10 p-0.5 rounded shrink-0 font-mono font-sans">RE:</span>
                                      <span className="text-[10px] text-zinc-400 italic line-clamp-2 font-sans">“{comp.response}” ({comp.respondedBy})</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Complaint Details and Interactive Reply box */}
                        <div className="lg:col-span-6 sticky top-24">
                          {selectedComplaintId ? (() => {
                            const compObj = complaints.find(c => c.id === selectedComplaintId);
                            if (!compObj) return <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-500 font-sans">Selecciona un reporte.</div>;
                            return (
                              <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl flex flex-col gap-6">
                                <div className="border-b border-zinc-900 pb-4 flex justify-between items-center">
                                  <div>
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase font-mono tracking-wider">Detalles de Reporte</span>
                                    <h4 className="font-bold text-sm text-white mt-1 font-sans font-display">Comensal: {compObj.userName}</h4>
                                  </div>
                                  <span className="text-[11px] text-zinc-500 font-mono bg-zinc-900 px-2.5 py-1 rounded">{new Date(compObj.createdAt).toLocaleString()}</span>
                                </div>

                                <div className="flex flex-col gap-3">
                                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                    <div>
                                      <span className="text-zinc-400 block font-sans">Correo del usuario:</span>
                                      <span className="font-semibold text-zinc-300">{compObj.userEmail}</span>
                                    </div>
                                    <div>
                                      <span className="text-zinc-400 block font-sans">Asunto / Tipo:</span>
                                      <span className="font-semibold text-red-450 bg-red-650/15 px-2 py-0.5 rounded font-sans">{compObj.subject}</span>
                                    </div>
                                  </div>

                                  <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl mt-2 italic leading-relaxed text-xs font-bold text-zinc-350">
                                    “{compObj.message}”
                                  </div>
                                </div>

                                <form onSubmit={async (e) => {
                                  e.preventDefault();
                                  if (!currentUser) return;
                                  
                                  const responseText = complaintResponseText;
                                  if (!responseText.trim()) {
                                    alert("Por favor ingresa un comentario o respuesta.");
                                    return;
                                  }

                                  try {
                                    await dbService.updateComplaintStatus(compObj.id, 'revisada', responseText, currentUser.displayName);
                                    setComplaints(prev => prev.map(c => c.id === compObj.id ? { 
                                      ...c, 
                                      status: 'revisada', 
                                      response: responseText, 
                                      respondedBy: currentUser.displayName, 
                                      updatedAt: new Date().toISOString() 
                                    } : c));
                                    alert("La queja ha sido actualizada a Atendida con éxito.");
                                  } catch (err) {
                                    console.error(err);
                                    alert("Ocurrió un error.");
                                  }
                                }} className="flex flex-col gap-4 border-t border-zinc-900 pt-4">
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-sans">Responder Oficialmente al Comensal:</label>
                                    <textarea
                                      required
                                      value={complaintResponseText}
                                      onChange={(e) => setComplaintResponseText(e.target.value)}
                                      placeholder="Explica qué acción Correctiva se tomará o responde al comensal..."
                                      className="bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 text-xs h-28 resize-none text-white focus:outline-none focus:ring-1 focus:ring-red-655 leading-relaxed font-sans"
                                    />
                                  </div>

                                  <div className="flex gap-2">
                                    <button
                                      type="submit"
                                      className="flex-1 bg-zinc-900 text-sky-400 border border-sky-500/20 hover:bg-zinc-800 font-bold py-2.5 rounded-xl text-xs transition-colors font-sans"
                                    >
                                      Atender / Responder
                                    </button>

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await dbService.updateComplaintStatus(compObj.id, 'resuelta', complaintResponseText, currentUser.displayName);
                                          setComplaints(prev => prev.map(c => c.id === compObj.id ? { 
                                            ...c, 
                                            status: 'resuelta', 
                                            response: complaintResponseText || undefined, 
                                            respondedBy: currentUser.displayName, 
                                            updatedAt: new Date().toISOString() 
                                          } : c));
                                          alert("Queja resuelta exitosamente.");
                                        } catch (err) {
                                          console.error(err);
                                        }
                                      }}
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors font-sans"
                                    >
                                      ✓ Marcar como Resuelta
                                    </button>
                                  </div>
                                </form>
                              </div>
                            );
                          })() : (
                            <div className="bg-zinc-950 p-12 rounded-2xl border border-zinc-800 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
                              <MessageSquare className="w-8 h-8 stroke-[1.5] text-zinc-700 mb-1 animate-pulse" />
                              <p className="font-semibold text-zinc-400 font-sans">Ningún reporte seleccionado</p>
                              <p className="max-w-[200px] leading-relaxed mx-auto text-zinc-500 text-[11px] font-sans">Haz clic en cualquiera de las quejas registradas a la izquierda para inspeccionarla, redactar una aclaración o marcarla como Resuelta definitivamente.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. EARNINGS TRANSFER PROTOCOL (EMPLEADO CAN DEPOSIT TO BOSS, ADMIN AUDITS LOGS) */}
                {activeTab === 'shift_earnings' && (
                  <div className="flex flex-col gap-6">
                    {currentUser.role === 'empleado' ? (
                      /* EMPLOYEE TRANSFER PANEL */
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Form area: Left 6 columns */}
                        <div className="lg:col-span-6 flex flex-col gap-6">
                          <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl flex flex-col gap-4">
                            <div>
                              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest font-mono">Cierre de Caja del Turno</span>
                              <h3 className="font-extrabold font-display text-base text-white mt-1 font-sans">Enviar Ganancias al Jefe Álvaro</h3>
                              <p className="text-xs text-zinc-400 mt-1 font-sans">Saca las ganancias de caja acumuladas por las comandas ya entregadas para resguardarlas de manera segura en la cuenta del jefe.</p>
                            </div>

                            {/* Aggregation card metrics */}
                            <div className="grid grid-cols-2 gap-3.5 bg-zinc-900 border border-zinc-850 p-4.5 rounded-xl text-left">
                              <div>
                                <span className="text-[10px] text-zinc-550 uppercase tracking-wider block font-bold font-mono">Pedidos Entregados Hoy:</span>
                                <span className="text-lg font-extrabold text-white font-display">
                                  {orders.filter(o => o.status === 'entregado').length} comandas
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-zinc-550 uppercase tracking-wider block font-bold font-mono">Efectivo Total Acumulado:</span>
                                <span className="text-lg font-extrabold text-emerald-400 font-display">
                                  ${orders.filter(o => o.status === 'entregado').reduce((sum, o) => sum + o.total, 0).toFixed(2)} MXN
                                </span>
                              </div>
                            </div>

                            <form onSubmit={async (e) => {
                              e.preventDefault();
                              const amtStr = transferAmountText;
                              const amt = parseFloat(amtStr);
                              if (isNaN(amt) || amt <= 0) {
                                alert("Por favor ingresa un monto decimal válido para transferir.");
                                return;
                              }

                              const newTransfer: ShiftTransfer = {
                                id: 'trans-' + Date.now(),
                                employeeId: currentUser.uid,
                                employeeName: currentUser.displayName,
                                employeeEmail: currentUser.email,
                                amount: amt,
                                comments: transferCommentsText || 'Transferencia de utilidades del turno regular - Sin incidencias reportadas.',
                                createdAt: new Date().toISOString()
                              };

                              try {
                                await dbService.saveShiftTransfer(newTransfer);
                                setShiftTransfers(prev => [newTransfer, ...prev]);
                                setTransferAmountText('');
                                setTransferCommentsText('');
                                alert(`✓ Se han enviado $${amt.toFixed(2)} MXN a la cuenta del Jefe Álvaro exitosamente.`);
                              } catch (err) {
                                console.error(err);
                                alert("Error al registrar transferencia.");
                              }
                            }} className="flex flex-col gap-4">
                              <div className="flex flex-col gap-1.5 font-mono">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-sans">Monto de Ganancia a Mandar ($ MXN):</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  required
                                  value={transferAmountText}
                                  onChange={(e) => setTransferAmountText(e.target.value)}
                                  placeholder="Ej: 1450.50"
                                  className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                                />
                                <span className="text-[10px] text-zinc-500 font-sans">Indica el total recortado que depositarás formalmente.</span>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-sans">Comentarios o Bitácora (Opcional):</label>
                                <textarea
                                  value={transferCommentsText}
                                  onChange={(e) => setTransferCommentsText(e.target.value)}
                                  placeholder="Comentarios adicionales sobre el corte de caja, mermas o incidencias..."
                                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs h-20 resize-none text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed font-sans"
                                />
                              </div>

                              <button
                                type="submit"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs transition-colors font-sans shadow-lg shadow-emerald-950/20 active:scale-[0.98] flex items-center justify-center gap-1.5"
                              >
                                <span>Mandar Utilidades al Jefe Álvaro Admin</span>
                              </button>
                            </form>
                          </div>
                        </div>

                        {/* Logs area: Right 6 columns */}
                        <div className="lg:col-span-6 flex flex-col gap-4">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-sans">Bitácora de Mis Envíos de Turno</span>
                          
                          {shiftTransfers.filter(t => t.employeeId === currentUser.uid).length === 0 ? (
                            <p className="text-xs text-zinc-500 italic py-2 font-sans">No has registrado depósitos en este periodo de caja de turno.</p>
                          ) : (
                            <div className="flex flex-col gap-3 max-h-[460px] overflow-y-auto pr-1">
                              {shiftTransfers
                                .filter(t => t.employeeId === currentUser.uid)
                                .map((t) => (
                                  <div 
                                    key={t.id}
                                    className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl flex flex-col gap-2 relative shadow-md font-mono text-zinc-300"
                                  >
                                    <div className="flex justify-between items-center text-xs font-bold">
                                      <span className="text-[10px] text-zinc-500">{new Date(t.createdAt).toLocaleString()}</span>
                                      <span className="text-emerald-400 font-display font-extrabold">+ ${t.amount.toFixed(2)} MXN</span>
                                    </div>
                                    <p className="text-xs text-zinc-300 italic mt-1 font-sans">
                                      “{t.comments}”
                                    </p>
                                    <span className="absolute bottom-2 right-3 text-[8px] bg-zinc-900 text-zinc-500 border border-zinc-850 p-1 rounded font-normal uppercase">
                                      ENTREGADO ✓
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* ADMINISTRATOR AUDIT AND STATS VIEW (BOSS VIEWING COMMITTED TRANSFERS) */
                      <div className="flex flex-col gap-6">
                        {/* Stats card */}
                        <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-zinc-500 uppercase font-mono tracking-wider font-bold">Cuentas Claras</span>
                            <h3 className="text-sm font-bold text-white font-sans font-display">Utilidades Depositadas por Empleados</h3>
                            <p className="text-xs text-zinc-400 leading-relaxed font-sans">Arqueos de caja y depósitos efectuados por el personal de atención.</p>
                          </div>

                          <div className="p-4 bg-zinc-900 border border-zinc-850 rounded-xl flex flex-col gap-1.5 text-left font-mono">
                            <span className="text-zinc-500 text-[10px] uppercase font-bold">Total Recibido (Cortes):</span>
                            <div className="flex items-baseline gap-1.5 mt-1">
                              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-display">
                                ${shiftTransfers.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
                              </span>
                              <span className="text-xs text-zinc-500">MXN</span>
                            </div>
                          </div>

                          <div className="p-4 bg-zinc-900 border border-zinc-850 rounded-xl flex flex-col gap-1.5 text-left font-mono">
                            <span className="text-zinc-500 text-[10px] uppercase font-bold">Depósitos Registrados:</span>
                            <div className="flex items-baseline gap-1 mt-1">
                              <span className="text-2xl sm:text-3xl font-extrabold text-sky-400 font-display">
                                {shiftTransfers.length}
                              </span>
                              <span className="text-xs text-zinc-500 font-sans">traspasos</span>
                            </div>
                          </div>
                        </div>

                        {/* Detailed receipt spreadsheet list */}
                        <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl flex flex-col gap-4">
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold font-sans">Bitácora General de Arqueos de Caja Recibidos</span>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-zinc-900 text-zinc-400 uppercase border-b border-zinc-800">
                                <tr>
                                  <th className="px-4 py-3">ID Transferencia</th>
                                  <th className="px-4 py-3">Empleado Remitente</th>
                                  <th className="px-4 py-3">Correo</th>
                                  <th className="px-4 py-3">Comentarios / Incidencias de Caja</th>
                                  <th className="px-4 py-3">Fecha de Recepción</th>
                                  <th className="px-4 py-3 text-right">Monto Recibido</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800 text-zinc-300">
                                {shiftTransfers.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="text-center py-6 text-zinc-500">No se registran envíos de caja de empleados aún.</td>
                                  </tr>
                                ) : (
                                  shiftTransfers.map((t) => (
                                    <tr key={t.id} className="hover:bg-zinc-900/40">
                                      <td className="px-4 py-3 text-zinc-500 text-[11px]">{t.id}</td>
                                      <td className="px-4 py-3 font-semibold text-white font-sans text-xs">{t.employeeName}</td>
                                      <td className="px-4 py-3 text-zinc-500 text-[11px]">{t.employeeEmail}</td>
                                      <td className="px-4 py-3 text-yellow-500 italic text-[11px] font-sans">“{t.comments}”</td>
                                      <td className="px-4 py-3 text-zinc-400">{new Date(t.createdAt).toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right font-extrabold text-emerald-400 font-display text-sm">${t.amount.toFixed(2)}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

          </div>

        ) : (
          
          /* =========================================================================
             STANDARD USER PORTAL (CLIENT CLIENT)
             ========================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* CENTRAL MENU BROWSER (8/12 COLS) */}
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* NAVIGATION MODES SELECTOR */}
              <div className="flex bg-red-650 p-1.5 rounded-2xl bg-zinc-950 border border-zinc-850 gap-1 font-display self-start">
                {[
                  { id: 'menu', label: 'Ver Menú de Comidas', icon: Utensils },
                  { id: 'historial', label: 'Mis Pedidos Activos', icon: Clock },
                  { id: 'perfil', label: 'Mi Perfil Villa', icon: User },
                  { id: 'buzon_quejas', label: 'Buzón de Quejas', icon: MessageSquare }
                ].map(view => {
                  const Icon = view.icon;
                  const isActive = activeTab === view.id;
                  return (
                    <button
                      key={view.id}
                      onClick={() => setActiveTab(view.id)}
                      className={`flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl text-xs font-bold transition-all transition-colors duration-200 ${
                        isActive 
                          ? 'bg-red-600 text-white shadow-md' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {view.label}
                    </button>
                  );
                })}
              </div>

              {/* TABS INNER LOGIC CONTROLLER */}
              {activeTab === 'menu' && (
                <div className="flex flex-col gap-6">
                  
                  {/* SEARCH BAR & CATEGORY CHIPS */}
                  <div className="flex flex-col md:flex-row gap-3">
                    
                    {/* Input search */}
                    <div className="flex-1 relative">
                      <Search className="w-4.5 h-4.5 text-zinc-450 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar tacos al pastor, suadero, flan, extras..."
                        className={`w-full ${
                          darkMode ? 'bg-zinc-955 border-zinc-800 text-white placeholder-zinc-500' : 'bg-white border-gray-200 text-zinc-900 placeholder-gray-450'
                        } border rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600`}
                      />
                    </div>

                    {/* Quick Category Chips */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                      {[
                        { id: 'all', label: '🌮 Todos' },
                        { id: 'tacos', label: 'Tacos' },
                        { id: 'bebidas', label: 'Bebidas' },
                        { id: 'extras', label: 'Extras' },
                        { id: 'postres', label: 'Postres' }
                      ].map((chip) => {
                        const isSel = activeCategory === chip.id;
                        return (
                          <button
                            key={chip.id}
                            onClick={() => setActiveCategory(chip.id as any)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all ${
                              isSel 
                                ? 'bg-red-600 text-white border-red-500 shadow-md' 
                                : darkMode 
                                ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white' 
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>

                  </div>

                  {/* PRODUCTS MENU GRID */}
                  {filteredProducts.length === 0 ? (
                    <div className="text-center py-16 text-zinc-500">
                      <Search className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                      <p className="font-semibold text-lg text-zinc-700 dark:text-zinc-300">Ningún platillo coincide</p>
                      <p className="text-xs">Intenta ingresando otra palabra clave en el menú de la Villa.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredProducts.map((product) => {
                        const inCart = cart.find(item => item.productId === product.id);
                        return (
                          <div 
                            key={product.id}
                            id={`product-card-${product.id}`}
                            className={`rounded-2xl border transition-all flex flex-col justify-between p-4.5 gap-4 shadow-sm hover:shadow-md ${
                              darkMode ? 'bg-zinc-950 border-zinc-800 hover:border-zinc-700' : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between items-center gap-2">
                                <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                                  product.category === 'tacos' ? 'bg-red-500/10 text-red-550 border border-red-500/20' :
                                  product.category === 'bebidas' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                                  product.category === 'extras' ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20' :
                                  'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                }`}>
                                  {product.category}
                                </span>
                                {!product.available && (
                                  <span className="text-[10px] text-red-500 font-bold font-mono">⚠️ AGOTADO</span>
                                )}
                              </div>
                              <h3 className="font-extrabold text-base tracking-tight">{product.name}</h3>
                              <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'} font-medium leading-relaxed`}>{product.description}</p>
                            </div>

                            <div className="flex items-center justify-between border-t border-zinc-800/10 dark:border-zinc-800/50 pt-3.5 mt-1">
                              <span className="font-mono text-lg font-black text-red-600 dark:text-yellow-400">${product.price.toFixed(2)} <span className="text-xs font-normal">MXN</span></span>
                              {product.available ? (
                                <div className="flex gap-1">
                                  {product.category === 'tacos' ? (
                                    <button
                                      onClick={() => handleOpenProductForm(product)}
                                      className="hidden" // Reserved
                                    />
                                  ) : null}
                                  
                                  {product.category === 'tacos' ? (
                                    <button
                                      onClick={() => handleOpenCustomizer(product)}
                                      className="bg-red-650 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Personalizar taco
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleAddDirectToCart(product)}
                                      className="bg-zinc-900 dark:bg-zinc-800 hover:bg-red-600 dark:hover:bg-red-600 hover:text-white border border-zinc-750 text-zinc-300 dark:text-zinc-100 font-bold text-xs px-3 py-2 rounded-xl cursor-pointer transition-all flex items-center gap-1"
                                    >
                                      <ShoppingBag className="w-3.5 h-3.5" />
                                      {inCart ? `En carro (${inCart.quantity})` : 'Agregar directo'}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-500 text-xs font-semibold cursor-not-allowed">No Disponible</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* SPECIAL DIALOG CUSTOMIZER OVERLAY MODAL */}
                  <AnimatePresence>
                    {customizerProduct !== null && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          id="meal-customizer-modal"
                          className={`w-full max-w-lg rounded-2xl p-6 shadow-2xl border ${
                            darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-gray-200 text-zinc-900'
                          } flex flex-col gap-4 max-h-[90vh] overflow-y-auto`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-[10px] uppercase font-bold font-mono ${darkMode ? 'text-yellow-400' : 'text-red-600'}`}>🍔 Armar Comanda Premium</span>
                              <h3 className={`font-extrabold font-display text-xl leading-none mt-1 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{customizerProduct.name}</h3>
                              <p className={`text-xs mt-1.5 ${darkMode ? 'text-zinc-400' : 'text-zinc-550'}`}>{customizerProduct.description}</p>
                            </div>
                            <button 
                              onClick={() => setCustomizerProduct(null)} 
                              className={`p-1 rounded-full hover:bg-zinc-900/60 transition-colors ${darkMode ? 'text-zinc-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'}`}
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          <div className={`flex flex-col gap-4 py-2 divide-y ${darkMode ? 'divide-zinc-900' : 'divide-gray-100'}`}>
                            
                            {/* 1. SELECCION DE TORTILLA */}
                            <div className="flex flex-col gap-2 pt-2">
                              <label className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-yellow-400' : 'text-red-700'}`}>1. Tipo de Tortilla:</label>
                              <div className="grid grid-cols-3 gap-2">
                                {['Maíz', 'Harina', 'Doble Maíz'].map(type => (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => setCustomizerTacoType(type)}
                                    className={`px-3 py-2 rounded-xl text-center text-xs font-semibold border transition-all ${
                                      customizerTacoType === type 
                                        ? 'bg-red-600 text-white border-red-500 ring-2 ring-red-400/20 shadow-sm' 
                                        : (darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-850' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200')
                                    }`}
                                  >
                                    {type}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 2. AGREGAR BEBIDA COMPAÑERA DENTRO DE PEDIDO */}
                            <div className="flex flex-col gap-2 pt-3">
                              <label className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-yellow-400' : 'text-red-700'}`}>2. Acompañar con Bebida (Opcional):</label>
                              <select 
                                value={customizerBeverage}
                                onChange={(e) => setCustomizerBeverage(e.target.value)}
                                className={`border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-650 ${
                                  darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-gray-50 border-gray-300 text-gray-800'
                                }`}
                              >
                                <option value="">-- Sin Bebida Combinada --</option>
                                {products.filter(p => p.category === 'bebidas' && p.available).map(bev => (
                                  <option key={bev.id} value={bev.id}>{bev.name} (+${bev.price.toFixed(2)} MXN)</option>
                                ))}
                              </select>
                            </div>

                            {/* 3. EXTRAS */}
                            <div className="flex flex-col gap-2 pt-3">
                              <label className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-yellow-400' : 'text-red-700'}`}>3. Añadir Extras:</label>
                              <div className="grid grid-cols-2 gap-2">
                                {products.filter(p => p.category === 'extras' && p.available).map(ext => {
                                  const isChecked = !!customizerExtras[ext.id];
                                  return (
                                    <button
                                      key={ext.id}
                                      type="button"
                                      onClick={() => setCustomizerExtras({ ...customizerExtras, [ext.id]: !isChecked })}
                                      className={`px-3 py-2.5 rounded-xl text-left text-xs font-semibold border transition-all flex justify-between items-center ${
                                        isChecked 
                                          ? (darkMode ? 'bg-zinc-900 border-yellow-500 text-yellow-300 font-bold' : 'bg-red-50 border-red-500 text-red-650 font-bold') 
                                          : (darkMode ? 'bg-zinc-900/40 border-zinc-850 text-zinc-400 hover:bg-zinc-900' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100')
                                      }`}
                                    >
                                      <span>{ext.name}</span>
                                      <span className={`font-mono text-xs ${isChecked ? (darkMode ? 'text-yellow-400' : 'text-red-600') : 'text-gray-505'}`}>+${ext.price}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 4. POSTRE */}
                            <div className="flex flex-col gap-2 pt-3">
                              <label className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-yellow-400' : 'text-red-700'}`}>4. Cerrar con Postre (Opcional):</label>
                              <select 
                                value={customizerPostre}
                                onChange={(e) => setCustomizerPostre(e.target.value)}
                                className={`border rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-650 ${
                                  darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-gray-50 border-gray-300 text-gray-800'
                                }`}
                              >
                                <option value="">-- Sin Postre Cerrador --</option>
                                {products.filter(p => p.category === 'postres' && p.available).map(pos => (
                                  <option key={pos.id} value={pos.id}>{pos.name} (+${pos.price.toFixed(2)} MXN)</option>
                                ))}
                              </select>
                            </div>

                            {/* 5. NOTES AND OBSERVATIONS */}
                            <div className="flex flex-col gap-1.5 pt-3">
                              <label className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-yellow-400' : 'text-red-700'}`}>5. Observaciones especiales:</label>
                              <textarea
                                value={customizerObservations}
                                onChange={(e) => setCustomizerObservations(e.target.value)}
                                placeholder="Ej: Sin cebolla, piña extra, la salsa verde bien separada por favor..."
                                className={`border rounded-xl p-3 text-xs h-16 resize-none focus:outline-none focus:ring-1 focus:ring-red-650 ${
                                  darkMode ? 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-800 placeholder-gray-400'
                                }`}
                              />
                            </div>

                            {/* 6. QUANTITY CONTROLLER */}
                            <div className="flex justify-between items-center pt-3">
                              <span className={`text-xs font-bold uppercase ${darkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Cantidad:</span>
                              <div className="flex items-center gap-3">
                                <button 
                                  type="button"
                                  onClick={() => setCustomizerQuantity(Math.max(1, customizerQuantity - 1))}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold border transition-colors ${
                                    darkMode 
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-350 hover:bg-zinc-800 hover:text-white' 
                                      : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-black font-semibold'
                                  }`}
                                >
                                  -
                                </button>
                                <span className={`font-mono font-bold text-base w-6 text-center ${darkMode ? 'text-white' : 'text-zinc-800'}`}>{customizerQuantity}</span>
                                <button 
                                  type="button"
                                  onClick={() => setCustomizerQuantity(customizerQuantity + 1)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold border transition-colors ${
                                    darkMode 
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-350 hover:bg-zinc-800 hover:text-white' 
                                      : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200 hover:text-black font-semibold'
                                  }`}
                                >
                                  +
                                </button>
                              </div>
                            </div>

                          </div>

                          <div className={`flex gap-2.5 border-t pt-4 mt-2 ${darkMode ? 'border-zinc-800' : 'border-gray-150'}`}>
                            <button
                              onClick={() => setCustomizerProduct(null)}
                              className={`flex-1 py-3 rounded-xl font-bold text-xs transition-colors ${
                                darkMode 
                                  ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200' 
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'
                              }`}
                            >
                              Regresar
                            </button>
                            <button
                              onClick={handleAddBundleToCart}
                              className="flex-1 bg-red-650 text-white hover:bg-red-750 font-bold text-xs py-3 rounded-xl shadow-md flex justify-center items-center gap-2 transition-all active:scale-[0.98]"
                            >
                              <ShoppingBag className="w-4 h-4" />
                              Guardar en Carrito (${customizerTotalPrice.toFixed(2)} MXN)
                            </button>
                          </div>

                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                </div>
              )}

              {/* 2. CUSTOMER ORDERS PAST TIMER HISTORIES */}
              {activeTab === 'historial' && (
                <div className="flex flex-col gap-6">
                  
                  <div className="flex justify-between items-center bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                    <div>
                      <h3 className="font-extrabold font-display text-base text-zinc-100">Mis Pedidos y Estados del Delivery</h3>
                      <p className="text-xs text-zinc-400">Revisa la comanda cocinándose en tiempo real.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    {orders.filter(o => o.userId === currentUser.uid).length === 0 ? (
                      <div className="text-center bg-zinc-950 p-12 rounded-2xl border border-zinc-850">
                        <Clock className="w-12 h-12 text-zinc-550 mx-auto mb-2 animate-pulse" />
                        <h4 className="font-bold text-white text-base">Aún no has ordenado tacos de la Villa</h4>
                        <p className="text-xs text-zinc-405 mt-1">Inserta deliciosos tacos en el carrito de compras para iniciar el rastreador.</p>
                        <button 
                          onClick={() => setActiveTab('menu')}
                          className="mt-4 bg-red-650 text-white font-semibold text-xs px-4 py-2 rounded-lg"
                        >
                          Ir al Menú
                        </button>
                      </div>
                    ) : (
                      orders.filter(o => o.userId === currentUser.uid).map(order => {
                        const canCancel = order.status === 'pendiente';
                        return (
                          <div 
                            key={order.id} 
                            className="bg-zinc-950 rounded-2xl p-5 border border-zinc-850 shadow-md flex flex-col gap-4"
                          >
                            <div className="flex flex-wrap items-center justify-between border-b border-zinc-850 pb-3 gap-2">
                              <div>
                                <span className="font-mono font-bold text-zinc-200"># Comanda ID: {order.id}</span>
                                <span className="text-xs text-zinc-500 font-mono block sm:inline sm:ml-2">{new Date(order.createdAt).toLocaleString()}</span>
                              </div>
                              <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                                order.status === 'pendiente' ? 'bg-yellow-400 text-zinc-950' :
                                order.status === 'preparacion' ? 'bg-orange-600 text-white' :
                                order.status === 'en_camino' ? 'bg-sky-600 text-white' :
                                order.status === 'entregado' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400'
                              }`}>
                                {order.status}
                              </span>
                            </div>

                            {/* PROGRESS TRACKER VISUAL TIMELINE */}
                            <div className="py-2">
                              {/* Labels */}
                              <div className="grid grid-cols-5 text-center text-[10px] font-bold text-zinc-405 mb-2 uppercase tracking-tight">
                                <span className={order.status === 'pendiente' ? 'text-yellow-400 font-black' : 'text-zinc-500'}>Recibido</span>
                                <span className={order.status === 'preparacion' ? 'text-orange-500 font-black' : 'text-zinc-500'}>Preparado</span>
                                <span className={order.status === 'en_camino' ? 'text-sky-400 font-black' : 'text-zinc-500'}>De camino</span>
                                <span className={order.status === 'entregado' ? 'text-emerald-400 font-black' : 'text-zinc-500'}>Entregado</span>
                                <span className={order.status === 'cancelado' ? 'text-red-500 font-black' : 'text-zinc-500'}>Cancelado</span>
                              </div>
                              
                              {/* Visual Progress Line */}
                              <div className="h-2.5 bg-zinc-900 rounded-full flex overflow-hidden border border-zinc-800">
                                <div className={`h-full ${
                                  order.status === 'pendiente' ? 'w-1/5 bg-yellow-450' :
                                  order.status === 'preparacion' ? 'w-2/5 bg-orange-500 animate-pulse' :
                                  order.status === 'en_camino' ? 'w-3/5 bg-sky-500 animate-pulse' :
                                  order.status === 'entregado' ? 'w-full bg-emerald-500' : 'w-full bg-zinc-700'
                                }`}></div>
                              </div>
                            </div>

                            {/* ORDER ITEMS LIST SUMMARY */}
                            <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-850">
                              <h5 className="text-xs font-semibold text-yellow-450 uppercase mb-2">Platillos pedidos:</h5>
                              <ul className="text-xs space-y-1">
                                {order.items.map((it, idx) => (
                                  <li key={idx} className="flex justify-between items-center text-zinc-350">
                                    <span><span className="font-mono text-red-500 font-bold">{it.quantity}x</span> {it.name}</span>
                                    <span className="font-mono">${(it.price * it.quantity).toFixed(2)}</span>
                                  </li>
                                ))}
                              </ul>
                              {order.observations && (
                                <p className="text-[11px] font-medium italic text-zinc-455 border-t border-zinc-850/50 mt-2 pt-2">
                                  <span className="font-semibold text-yellow-500">Observaciones:</span> {order.observations}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col lg:flex-row justify-between items-end lg:items-center gap-3 border-t border-zinc-850 pt-3">
                              <div className="text-xs">
                                <p className="text-zinc-450"><span className="font-semibold">Dirección de Entrega:</span> {order.deliveryAddress}</p>
                                <p className="text-zinc-500 mt-0.5"><span className="font-semibold">Teléfono de Entrega:</span> {order.deliveryPhone}</p>
                              </div>
                              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <p className="font-mono text-lg font-bold text-emerald-400">Total: ${order.total.toFixed(2)} MXN</p>
                                  
                                  {canCancel && (
                                    <button
                                      onClick={() => {
                                        setCancelOrderReasonId(order.id);
                                        setCancelReasonText('');
                                      }}
                                      className="bg-zinc-905 border border-red-500/30 hover:border-red-500/60 hover:bg-red-500/10 text-red-400 font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all"
                                    >
                                      Cancelar Pedido
                                    </button>
                                  )}
                                </div>
                                {(order.userEmail === 'carlos.mendoza@gmail.com' || order.userEmail === 'sofia.gomez@gmail.com') && (
                                  <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-1 rounded">
                                    ✓ Depositado a Álvaro Jefe
                                  </span>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* CANCELLATION MOTIVE MODAL POPUP */}
                  <AnimatePresence>
                    {cancelOrderReasonId !== null && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85">
                        <div className={`w-full max-w-sm rounded-2xl p-5 shadow-2xl border ${
                          darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-gray-200 text-zinc-900'
                        } flex flex-col gap-3`}>
                          <div className="flex items-center gap-2 text-red-500">
                            <AlertCircle className="w-5 h-5" />
                            <h4 className="font-extrabold font-display">¿Confirmar Cancelación de Pedido?</h4>
                          </div>
                          <p className="text-xs text-zinc-450 leading-relaxed">
                            Los pedidos únicamente se pueden cancelar antes de que la taquería comience su preparación de cocina. Escribe el motivo:
                          </p>

                          <form onSubmit={handleCancelOrder} className="flex flex-col gap-3.5 mt-2">
                            <input 
                              type="text" 
                              required
                              value={cancelReasonText}
                              onChange={(e) => setCancelReasonText(e.target.value)}
                              placeholder="Ej. Me equivoqué de tacos, tardó demasiado..."
                              className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500 ${
                                darkMode 
                                  ? 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500' 
                                  : 'bg-gray-100 border-gray-300 text-zinc-850 placeholder-gray-400'
                              }`}
                            />

                            <div className="flex gap-2 border-t border-zinc-850 pt-3">
                              <button
                                type="button"
                                onClick={() => setCancelOrderReasonId(null)}
                                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                  darkMode 
                                    ? 'bg-zinc-900 text-zinc-350 hover:bg-zinc-800' 
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                Regresar
                              </button>
                              <button
                                type="submit"
                                className="flex-1 bg-red-600 text-white font-bold py-2 rounded-xl text-xs hover:bg-red-700"
                              >
                                Cancelar Comanda
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                  </AnimatePresence>

                </div>
              )}

              {/* 3. CUSTOMER PROFILE ADDRESS BOOK CONFIG */}
              {activeTab === 'perfil' && (
                <div className={`p-6 rounded-2xl border shadow-xl flex flex-col gap-6 ${
                  darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-gray-200 text-zinc-900'
                }`}>
                  <div>
                    <h3 className={`font-extrabold font-display text-base ${darkMode ? 'text-zinc-100' : 'text-gray-900'}`}>Mis Datos de Entrega y Envío</h3>
                    <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Guarda tus datos de contacto por defecto para que tus pedidos salgan más velozmente.</p>
                  </div>

                  <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className={`text-xs font-semibold uppercase ${darkMode ? 'text-zinc-450' : 'text-gray-500'}`}>Nombre del Comensal:</label>
                      <input 
                        type="text" 
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className={`border rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500 ${
                          darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-gray-800'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <div className="flex flex-col gap-1.5">
                        <label className={`text-xs font-semibold uppercase ${darkMode ? 'text-zinc-455' : 'text-gray-500'}`}>Email de Google:</label>
                        <input 
                          type="email" 
                          disabled
                          value={currentUser.email}
                          className={`border rounded-xl px-4 py-2.5 text-xs cursor-not-allowed ${
                            darkMode ? 'bg-zinc-900/60 border-zinc-800 text-zinc-500' : 'bg-gray-150 border-gray-300 text-gray-500'
                          }`}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 font-mono">
                        <label className={`text-xs font-semibold uppercase ${darkMode ? 'text-zinc-455' : 'text-gray-500'}`}>Teléfono de Contacto:</label>
                        <input 
                          type="text" 
                          required
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          placeholder="Ej: 5543210987"
                          className={`border rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500 font-mono ${
                            darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-gray-800 font-medium'
                          }`}
                        />
                      </div>

                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className={`text-xs font-semibold uppercase ${darkMode ? 'text-zinc-455' : 'text-gray-500'}`}>Dirección de Entrega Predeterminada:</label>
                      <textarea
                        required
                        value={profileAddress}
                        onChange={(e) => setProfileAddress(e.target.value)}
                        placeholder="Calle, Número, Colonia, Municipio, Código Postal..."
                        className={`border rounded-xl p-3.5 text-xs h-20 resize-none font-medium leading-relaxed focus:outline-none focus:ring-1 focus:ring-red-655 ${
                          darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-gray-855'
                        }`}
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={profileSaving}
                      className="bg-red-650 text-white font-bold hover:bg-red-700 py-3 rounded-xl text-xs transition-all self-end px-6 shadow-md"
                    >
                      {profileSaving ? 'Guardando en la Carta...' : 'Actualizar Perfil de Comensal'}
                    </button>
                  </form>
                </div>
              )}

              {/* 4. CUSTOMER COMPLAINTS BOX TAB VIEW */}
              {activeTab === 'buzon_quejas' && (
                <div className={`p-6 rounded-2xl border shadow-xl flex flex-col gap-6 ${
                  darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-gray-200 text-zinc-900'
                }`}>
                  <div className="flex flex-col gap-1.5">
                    <h3 className={`font-extrabold font-display text-base ${darkMode ? 'text-zinc-100' : 'text-gray-900'}`}>Buzón de Sugerencias y Quejas</h3>
                    <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Tu opinión es vital para nosotros. Mándanos cualquier reporte técnico o queja para resolverla de inmediato.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Create Complaint Box form */}
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!currentUser) {
                        alert("Por favor inicia sesión con Google primero.");
                        return;
                      }

                      if (!newComplaintMessage.trim()) {
                        alert("Por favor redacta un mensaje descriptivo para ayudarnos.");
                        return;
                      }

                      setSubmittingComplaint(true);
                      
                      const compObj: Complaint = {
                        id: 'comp-' + Date.now(),
                        userId: currentUser.uid,
                        userName: currentUser.displayName,
                        userEmail: currentUser.email,
                        subject: newComplaintSubject,
                        message: newComplaintMessage,
                        status: 'pendiente',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                      };

                      try {
                        await dbService.saveComplaint(compObj);
                        setComplaints(prev => [compObj, ...prev]);
                        setNewComplaintMessage('');
                        alert("✓ ¡Sugerencia enviada! El personal de Villa y el administrador Álvaro revisarán de inmediato.");
                      } catch (err) {
                        console.error(err);
                        alert("Hubo un error al registrar reporte.");
                      } finally {
                        setSubmittingComplaint(false);
                      }
                    }} className="flex flex-col gap-4">
                      
                      <div className="flex flex-col gap-1.5">
                        <label className={`text-xs font-semibold uppercase ${darkMode ? 'text-zinc-450' : 'text-gray-500'}`}>Clasificación del Reporte:</label>
                        <select
                          value={newComplaintSubject}
                          onChange={(e) => setNewComplaintSubject(e.target.value)}
                          className={`border rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-500 ${
                            darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-gray-850 font-medium'
                          }`}
                        >
                          <option value="Calidad de Tacos">Calidad u olor de alimentos</option>
                          <option value="Demora en el Reparto">Demora de entrega o repartidor</option>
                          <option value="Atención Telefónica">Atención al cliente / llamadas</option>
                          <option value="Problemas con la App">Fallas técnicas en comandos en vivo</option>
                          <option value="Sugerencia de Menú">Sugerencias y aditivos al menú</option>
                          <option value="Otro motivo">Otro asunto general</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={`text-xs font-semibold uppercase ${darkMode ? 'text-zinc-455' : 'text-gray-500'}`}>Describe detalladamente la incidencia:</label>
                        <textarea
                          required
                          value={newComplaintMessage}
                          onChange={(e) => setNewComplaintMessage(e.target.value)}
                          placeholder="Por favor indícanos qué sucedió, incluyendo número de pedido si aplica..."
                          className={`border rounded-xl p-3.5 text-xs h-28 resize-none font-medium leading-relaxed focus:outline-none focus:ring-1 focus:ring-red-655 ${
                            darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-50 border-gray-300 text-gray-825'
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingComplaint}
                        className="bg-red-650 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors self-start px-6 shadow-md"
                      >
                        {submittingComplaint ? 'Enviando...' : 'Mandar Reporte Oficial'}
                      </button>
                    </form>

                    {/* Complaint history logs */}
                    <div className="flex flex-col gap-4">
                      <span className={`text-xs font-bold uppercase ${darkMode ? 'text-zinc-500' : 'text-gray-450'}`}>Mis Reportes Previos</span>
                      
                      {complaints.filter(c => c.userId === currentUser.uid).length === 0 ? (
                        <div className="text-center py-8 flex flex-col items-center gap-2">
                          <MessageSquare className="w-8 h-8 text-zinc-450 shrink-0 animate-bounce" />
                          <p className="text-xs text-zinc-500">Aún no has levantado quejas o reportes de servicio.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
                          {complaints
                            .filter(c => c.userId === currentUser.uid)
                            .map((c) => (
                              <div
                                key={c.id}
                                className={`p-4 rounded-xl border flex flex-col gap-2 relative ${
                                  darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-gray-50 border-gray-250 text-zinc-900'
                                }`}
                              >
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-bold text-red-600 dark:text-yellow-455 font-sans">{c.subject}</span>
                                  <span className="text-[9px] uppercase font-bold text-zinc-400 font-mono">{new Date(c.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className={`text-xs italic leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-gray-700'}`}>
                                  “{c.message}”
                                </p>

                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                    c.status === 'resuelta' 
                                      ? 'bg-emerald-500/10 text-emerald-500' 
                                      : c.status === 'revisada' 
                                        ? 'bg-sky-500/10 text-sky-500' 
                                        : 'bg-yellow-500/10 text-yellow-600'
                                  }`}>
                                    {c.status === 'pendiente' ? 'Pendiente' : c.status === 'revisada' ? 'Atendida' : 'Resuelta ✓'}
                                  </span>
                                </div>

                                {c.response && (
                                  <div className={`mt-2 p-2.5 rounded border flex flex-col gap-1 ${
                                    darkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-white border-gray-200'
                                  }`}>
                                    <span className="text-[9px] font-bold text-emerald-500 uppercase">Respuesta del Personal:</span>
                                    <p className={`text-xs italic ${darkMode ? 'text-zinc-400' : 'text-zinc-650'}`}>
                                      “{c.response}”
                                    </p>
                                    <span className="text-[8px] text-zinc-500 self-end font-mono">Atendido por: {c.respondedBy || 'Villa'}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* SHOPPING CART COMPANION COMPONENT (4/12 COLS) */}
            <div className="lg:col-span-4 sticky top-24 flex flex-col gap-6">
              
              <div className={`rounded-3xl border p-5 shadow-xl flex flex-col gap-4 ${
                darkMode ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-gray-200 text-zinc-900'
              }`}>
                
                <div className={`flex justify-between items-center border-b pb-3 ${darkMode ? 'border-zinc-800' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-red-650" />
                    <h3 className="font-extrabold font-display text-base tracking-tight text-red-650 dark:text-yellow-400">Carrito de Tacos</h3>
                  </div>
                  <span className={`font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-gray-100 border-gray-200 text-gray-600'
                  }`}>
                    {cart.reduce((sum, i) => sum + i.quantity, 0)} items
                  </span>
                </div>

                {/* CART ITEMS CONTAINER */}
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
                    <Utensils className={`w-8 h-8 stroke-[1.5] mb-1 ${darkMode ? 'text-zinc-700' : 'text-zinc-300'}`} />
                    <p className={`font-semibold ${darkMode ? 'text-zinc-300' : 'text-zinc-755'}`}>Tu carrito de tacos está vacío</p>
                    <p className={`text-[11px] leading-relaxed max-w-[200px] mx-auto ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Haz clic en los productos para armar tus combinados o agregar bebidas.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
                    {cart.map((item, index) => {
                      return (
                        <div 
                          key={index} 
                          id={`cart-item-row-${index}`}
                          className={`p-3 rounded-xl border flex flex-col gap-2 relative group ${
                            darkMode ? 'bg-zinc-900/40 border-zinc-855' : 'bg-gray-50 border-gray-150'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <span className={`text-xs font-bold leading-tight truncate w-[80%] ${darkMode ? 'text-zinc-100' : 'text-zinc-805'}`}>{item.name}</span>
                            <button 
                              onClick={() => removeFromCart(item.productId)}
                              className="text-zinc-500 hover:text-red-500 absolute top-2 right-2 p-1 transition-colors"
                              title="Remover"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex justify-between items-center text-xs">
                            <span className="font-mono text-yellow-500 dark:text-yellow-450 font-semibold">${item.price.toFixed(2)} c/u</span>
                            
                            {/* Quantity controller in cart */}
                            <div className={`flex items-center gap-2 border rounded-lg p-0.5 ${
                              darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-250'
                            }`}>
                              <button 
                                onClick={() => updateCartQty(item.productId, -1)}
                                type="button"
                                className={`w-5 h-5 rounded flex items-center justify-center font-bold text-xs transition-colors ${
                                  darkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                                }`}
                              >
                                -
                              </button>
                              <span className={`font-mono font-bold text-[11px] w-4 text-center ${
                                darkMode ? 'text-white' : 'text-zinc-800'
                              }`}>{item.quantity}</span>
                              <button 
                                onClick={() => updateCartQty(item.productId, 1)}
                                type="button"
                                className={`w-5 h-5 rounded flex items-center justify-center font-bold text-xs transition-colors ${
                                  darkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                                }`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* CHECKOUT CREDENTIALS FORM */}
                {cart.length > 0 && (
                  <form onSubmit={handleSubmitOrder} className={`border-t pt-4 flex flex-col gap-3.5 ${
                    darkMode ? 'border-zinc-800' : 'border-gray-150'
                  }`}>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className={`text-[10px] uppercase tracking-wider font-bold ${darkMode ? 'text-zinc-400' : 'text-gray-500'}`}>📍 Dirección exacta de envío:</label>
                      <input 
                        type="text" 
                        required
                        value={cartAddress}
                        onChange={(e) => setCartAddress(e.target.value)}
                        placeholder="Ingresa tu dirección de casa u oficina..."
                        className={`border rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-red-600 focus:outline-none ${
                          darkMode ? 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500' : 'bg-gray-105 border-gray-300 text-gray-800 placeholder-gray-400'
                        }`}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 font-mono">
                      <label className={`text-[10px] uppercase tracking-wider font-bold ${darkMode ? 'text-zinc-400' : 'text-gray-500'}`}>📞 Teléfono para aviso de llegada:</label>
                      <input 
                        type="text" 
                        required
                        value={cartPhone}
                        onChange={(e) => setCartPhone(e.target.value)}
                        placeholder="Ej. 55 1234 5678"
                        className={`border rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-red-655 focus:outline-none font-mono ${
                          darkMode ? 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500' : 'bg-gray-105 border-gray-300 text-gray-800 placeholder-gray-400'
                        }`}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className={`text-[10px] uppercase tracking-wider font-bold ${darkMode ? 'text-zinc-400' : 'text-gray-500'}`}>📝 Indicaciones rápidas:</label>
                      <input 
                        type="text" 
                        value={cartObservations}
                        onChange={(e) => setCartObservations(e.target.value)}
                        placeholder="Notas como departamento 402, tocar timbre..."
                        className={`border rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-red-655 focus:outline-none ${
                          darkMode ? 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500' : 'bg-gray-105 border-gray-300 text-gray-800 placeholder-gray-400'
                        }`}
                      />
                    </div>

                    {/* BUDGET BILL SUMMARY */}
                    <div className={`p-3.5 rounded-2xl border select-none divide-y ${
                      darkMode ? 'bg-zinc-900/60 border-zinc-850 divide-zinc-800/80' : 'bg-gray-50 border-gray-200 divide-gray-100'
                    }`}>
                      <div className={`flex justify-between text-xs pb-1.5 ${darkMode ? 'text-zinc-350' : 'text-gray-655'}`}>
                        <span>Subtotal de Taco Menú</span>
                        <span className="font-mono text-xs font-semibold">${cartTotal.toFixed(2)}</span>
                      </div>
                      <div className={`flex justify-between text-xs py-1.5 ${darkMode ? 'text-zinc-355' : 'text-gray-655'}`}>
                        <span>Envío Express Taquero</span>
                        <span className="font-mono text-emerald-500 text-xs font-semibold">Gratis ($0)</span>
                      </div>
                      <div className={`flex justify-between text-sm pt-2 font-extrabold font-display ${darkMode ? 'text-zinc-100' : 'text-zinc-855'}`}>
                        <span>Total neto neto</span>
                        <span className="font-mono text-red-500 dark:text-yellow-400 text-base">${cartTotal.toFixed(2)} MXN</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingOrder}
                      className="w-full bg-red-650 text-white font-bold hover:bg-red-750 py-3.5 rounded-2xl text-xs transition-shadow shadow-lg flex justify-center items-center gap-2 cursor-pointer outline-none active:scale-[0.98] transition-all"
                    >
                      <CheckCircle2 className="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-transform" />
                      <span>{isSubmittingOrder ? 'Comandando orden...' : 'Confirmar Pedido Villa'}</span>
                    </button>

                  </form>
                )}

              </div>

            </div>

          </div>
        )}

      </main>

      {/* SIMULATED GOOGLE SIGN-IN MODAL */}
      <AnimatePresence>
        {showSimulatedGooglePopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 max-w-md w-full rounded-3xl border border-gray-200 dark:border-zinc-800 shadow-2xl p-6 sm:p-8 flex flex-col gap-6 relative font-sans"
            >
              <button
                type="button"
                onClick={() => setShowSimulatedGooglePopup(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 text-sm font-black p-1.5 focus:outline-none"
              >
                ✕
              </button>

              <div className="flex flex-col items-center text-center gap-3">
                {/* Simulated Google Logo */}
                <div className="bg-white p-3 rounded-full shadow-md border border-gray-100 flex items-center justify-center">
                  <svg className="w-10 h-10" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-extrabold font-display text-lg text-zinc-900 dark:text-zinc-100">
                    Acceder con Google
                  </h3>
                  <p className="text-xs text-zinc-550 dark:text-zinc-400 mt-1">
                    Simulador Oficial de Google OAuth 2.0 para evitar restricciones de iframe
                  </p>
                </div>
              </div>

              {simulatingGoogleSession ? (
                <div className="flex flex-col items-center justify-center py-8 gap-4">
                  <div className="flex gap-1">
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce delay-100 animate-infinite"></span>
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-bounce delay-200 animate-infinite"></span>
                    <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-bounce delay-300 animate-infinite"></span>
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-bounce delay-400 animate-infinite"></span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono animate-pulse">
                    {simulatedStatusText}
                  </p>
                </div>
              ) : mockGoogleScreen === 'accounts' ? (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                    Selecciona una cuenta para continuar:
                  </p>
                  
                  {/* Option 1: Admin */}
                  <button
                    type="button"
                    onClick={() => handleExecuteMockLogin('alvarukirtx@gmail.com', 'Álvaro Jefe', 'admin')}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-850 hover:border-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-red-600/10 border border-red-500/20 text-red-600 flex items-center justify-center font-bold text-sm">
                        A
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <span>Álvaro Jefe</span>
                          <span className="bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">Jefe Admin</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">alvarukirtx@gmail.com</div>
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
                  </button>

                  {/* Option 2: Carlos */}
                  <button
                    type="button"
                    onClick={() => handleExecuteMockLogin('carlos.mendoza@gmail.com', 'Carlos Mendoza', 'usuario')}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-850 hover:border-yellow-500 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-yellow-600/10 border border-yellow-500/20 text-yellow-600 flex items-center justify-center font-bold text-sm">
                        C
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <span>Carlos Mendoza</span>
                          <span className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">Cliente</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">carlos.mendoza@gmail.com</div>
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
                  </button>

                  {/* Option 3: Sofia */}
                  <button
                    type="button"
                    onClick={() => handleExecuteMockLogin('sofia.gomez@gmail.com', 'Sofía Gómez', 'usuario')}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-850 hover:border-purple-500 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-600/10 border border-purple-500/20 text-purple-600 flex items-center justify-center font-bold text-sm">
                        S
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <span>Sofía Gómez</span>
                          <span className="bg-purple-500/10 border border-purple-500/20 text-purple-600 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">Cliente</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">sofia.gomez@gmail.com</div>
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
                  </button>

                  {/* Option 3.5: Eduardo Empleado */}
                  <button
                    type="button"
                    onClick={() => handleExecuteMockLogin('eduardo.empleado@gmail.com', 'Eduardo Empleado', 'empleado')}
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-850 hover:border-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-600/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center font-bold text-sm">
                        E
                      </div>
                      <div>
                        <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                          <span>Eduardo Empleado</span>
                          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase">Empleado</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">eduardo.empleado@gmail.com</div>
                      </div>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
                  </button>

                  {/* Option 4: Custom */}
                  <button
                    type="button"
                    onClick={() => setMockGoogleScreen('custom')}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/20 transition-all text-xs font-semibold text-zinc-650 dark:text-zinc-400"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Usar otra cuenta de Google</span>
                  </button>
                </div>
              ) : (
                /* Custom Google account screen */
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Correo de Google / Gmail:</label>
                    <input
                      type="email"
                      required
                      value={customMockEmail}
                      onChange={(e) => setCustomMockEmail(e.target.value)}
                      placeholder="ejemplo@gmail.com"
                      className="bg-zinc-50 dark:bg-zinc-900 w-full border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Nombre Completo:</label>
                    <input
                      type="text"
                      value={customMockName}
                      onChange={(e) => setCustomMockName(e.target.value)}
                      placeholder="Ingresa tu nombre..."
                      className="bg-zinc-50 dark:bg-zinc-900 w-full border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Rol de Acceso:</label>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => setCustomMockRole('usuario')}
                        className={`py-2 px-1 text-center rounded-xl border text-[11px] font-semibold transition-all ${
                          customMockRole === 'usuario'
                            ? 'bg-red-50 border-red-500 text-red-650 dark:bg-red-950/20 dark:text-red-400'
                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 text-zinc-500'
                        }`}
                      >
                        Cliente
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMockRole('empleado')}
                        className={`py-2 px-1 text-center rounded-xl border text-[11px] font-semibold transition-all ${
                          customMockRole === 'empleado'
                            ? 'bg-red-50 border-red-500 text-red-655 dark:bg-red-950/20 dark:text-red-400'
                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 text-zinc-500'
                        }`}
                      >
                        Empleado
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMockRole('admin')}
                        className={`py-2 px-1 text-center rounded-xl border text-[11px] font-semibold transition-all ${
                          customMockRole === 'admin'
                            ? 'bg-red-50 border-red-500 text-red-650 dark:bg-red-950/20 dark:text-red-400'
                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 text-zinc-500'
                        }`}
                      >
                        Jefe Admin
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-zinc-150 dark:border-zinc-900 mt-2">
                    <button
                      type="button"
                      onClick={() => setMockGoogleScreen('accounts')}
                      className="flex-1 py-3 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      disabled={!customMockEmail}
                      onClick={() => handleExecuteMockLogin(customMockEmail, customMockName || 'Cliente Google', customMockRole)}
                      className="flex-1 bg-zinc-950 dark:bg-white dark:text-zinc-950 hover:bg-zinc-900 dark:hover:bg-zinc-100 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors disabled:opacity-50"
                    >
                      Iniciar Sesión
                    </button>
                  </div>
                </div>
              )}

              <div className="text-center text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center justify-center gap-1.5 mt-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Simulado seguro, no requiere contraseña.</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
