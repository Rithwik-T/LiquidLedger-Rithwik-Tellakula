import React, { useState, useEffect, createContext, useContext, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, 
  signOut as firebaseSignOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail
} from 'firebase/auth';
import { 
  getFirestore, collection, onSnapshot, query, doc, writeBatch, deleteDoc 
} from 'firebase/firestore';
import { 
  Plus, Scan, Wallet, Target, Receipt, LogOut, FileText, ShoppingBag, 
  Utensils, Zap, Search, X, Plane, Film, Mail, Lock, Trash2, Edit3, 
  ChevronLeft, ChevronRight, ChevronDown, BarChart3, Download, Settings, Snowflake, 
  CreditCard, Sparkles, Filter, FilterX, Repeat, PieChart as PieChartIcon, 
  ShieldCheck, Smartphone
} from 'lucide-react';
import { format, isThisMonth, isSameMonth, subMonths } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', errInfo);
}

// --- Types ---
type CardTheme = 'indigo' | 'teal' | 'rose' | 'amber';
type CardNetwork = 'visa' | 'mastercard' | 'amex';

type Card = {
  id: string;
  cardName: string;
  limit: number;
  currentBalance: number;
  theme: CardTheme;
  network: CardNetwork;
  isFrozen: boolean;
};

type Expense = {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  date: string;
  cardId: string;
  isRecurring: boolean;
};

type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

// --- Contexts ---
const AuthContext = createContext<any>(null);
const AppContext = createContext<any>(null);
const ToastContext = createContext<any>(null);

// --- Hooks ---
const useAuth = () => useContext(AuthContext);
const useApp = () => useContext(AppContext);
const useToast = () => useContext(ToastContext);

// --- Providers ---
function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "px-4 py-3 rounded-xl shadow-lg border backdrop-blur-xl flex items-center gap-3",
                t.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-100" :
                t.type === 'success' ? "bg-teal-500/10 border-teal-500/20 text-teal-100" :
                "bg-indigo-500/10 border-indigo-500/20 text-indigo-100"
              )}
            >
              <div className={cn(
                "w-2 h-2 rounded-full",
                t.type === 'error' ? "bg-red-500" : t.type === 'success' ? "bg-teal-500" : "bg-indigo-500"
              )} />
              <p className="text-sm font-medium">{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.error("Sign out failed", e);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateUserName = async (name: string) => {
      if (!auth.currentUser) return;
      await updateProfile(auth.currentUser, { displayName: name });
      setUser({ ...auth.currentUser });
  }

  return <AuthContext.Provider value={{ user, loading, signIn, signOut, signInWithEmail, signUpWithEmail, resetPassword, updateUserName }}>{children}</AuthContext.Provider>;
}

function AppProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    const path = `users/${user.uid}/cards`;
    const q = query(collection(db, path));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const c: Card[] = [];
      snapshot.forEach(doc => c.push({ id: doc.id, ...doc.data() } as Card));
      setCards(c);
      
      setActiveCardId(current => {
         if (!current && c.length > 0) return c[0].id;
         if (current && current !== 'all' && !c.find(x => x.id === current) && c.length > 0) return c[0].id;
         return current;
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return unsubscribe;
  }, [user.uid]);

  useEffect(() => {
    const path = `users/${user.uid}/expenses`;
    const q = collection(db, path);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const e: Expense[] = [];
      snapshot.forEach(doc => e.push({ id: doc.id, ...doc.data() } as Expense));
      e.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
      });
      setExpenses(e);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return unsubscribe;
  }, [user.uid]);

  const addCard = async (cardData: Omit<Card, 'id' | 'currentBalance' | 'isFrozen'>) => {
    const path = `users/${user.uid}/cards`;
    try {
      const newCardRef = doc(collection(db, path));
      const batch = writeBatch(db);
      batch.set(newCardRef, {
         ...cardData,
         currentBalance: 0,
         isFrozen: false
      });
      await batch.commit();
      addToast("Card added successfully", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      addToast("Failed to add card", "error");
    }
  };

  const addExpense = async (expenseData: Omit<Expense, 'id'>) => {
    const cardPath = `users/${user.uid}/cards/${expenseData.cardId}`;
    const expensesPath = `users/${user.uid}/expenses`;
    
    try {
      const cardRef = doc(db, cardPath);
      const card = cards.find(c => c.id === expenseData.cardId);
      if (!card) return;
      if (card.isFrozen) {
          addToast("Cannot add expense to a frozen card", "error");
          return;
      }
      
      const newBalance = (card.currentBalance || 0) + expenseData.amount;
      
      const batch = writeBatch(db);
      const expenseRef = doc(collection(db, expensesPath));
      
      batch.set(expenseRef, expenseData);
      batch.update(cardRef, { currentBalance: newBalance });
      
      await batch.commit();
      addToast("Expense recorded", "success");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.CREATE, expensesPath);
      addToast(error.message || "Failed to record expense", "error");
    }
  };

  const deleteExpense = async (expense: Expense) => {
      try {
          const cardPath = `users/${user.uid}/cards/${expense.cardId}`;
          const expPath = `users/${user.uid}/expenses/${expense.id}`;
          
          const card = cards.find(c => c.id === expense.cardId);
          if (!card) return;

          const batch = writeBatch(db);
          batch.delete(doc(db, expPath));
          batch.update(doc(db, cardPath), { currentBalance: Math.max(0, (card.currentBalance || 0) - expense.amount) });
          await batch.commit();
          addToast("Expense deleted", "info");
      } catch (error) {
          addToast("Failed to delete expense", "error");
      }
  }

  const deleteCard = async (cardId: string) => {
      try {
          const cardPath = `users/${user.uid}/cards/${cardId}`;
          // Delete all expenses associated
          const associatedExps = expenses.filter(e => e.cardId === cardId);
          const batch = writeBatch(db);
          associatedExps.forEach(e => {
              batch.delete(doc(db, `users/${user.uid}/expenses/${e.id}`));
          });
          batch.delete(doc(db, cardPath));
          await batch.commit();
          addToast("Card deleted", "success");
      } catch (e) {
          addToast("Failed to delete card", "error");
      }
  }

  const toggleCardFreeze = async (cardId: string) => {
      try {
          const card = cards.find(c => c.id === cardId);
          if (!card) return;
          await writeBatch(db).update(doc(db, `users/${user.uid}/cards/${cardId}`), { isFrozen: !card.isFrozen }).commit();
          addToast(`Card ${!card.isFrozen ? 'frozen' : 'unfrozen'}`, "info");
      } catch (e) {
          addToast("Failed to toggle freeze state", "error");
      }
  }

  return (
    <AppContext.Provider value={{ 
        cards, expenses, activeCardId, setActiveCardId, 
        addCard, addExpense, deleteExpense, deleteCard, toggleCardFreeze 
    }}>
      {children}
    </AppContext.Provider>
  );
}

// --- Shared UI Components ---
function GlassPanel({ children, className, onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn("bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl rounded-3xl", className)}
    >
      {children}
    </div>
  );
}

const getCategoryIcon = (category: string) => {
  switch (category) {
     case 'Food & Dining': return <Utensils className="w-5 h-5" />;
     case 'Electronics': return <Zap className="w-5 h-5" />;
     case 'Travel': return <Plane className="w-5 h-5" />;
     case 'Entertainment': return <Film className="w-5 h-5" />;
     default: return <ShoppingBag className="w-5 h-5" />;
  }
};

const getThemeClasses = (theme: CardTheme) => {
    switch (theme) {
        case 'indigo': return 'from-indigo-600 to-violet-700 shadow-indigo-500/50 ring-indigo-400 text-indigo-300';
        case 'teal': return 'from-teal-500 to-emerald-700 shadow-teal-500/50 ring-teal-400 text-teal-300';
        case 'rose': return 'from-rose-500 to-pink-700 shadow-rose-500/50 ring-rose-400 text-rose-300';
        case 'amber': return 'from-amber-500 to-orange-600 shadow-amber-500/50 ring-amber-400 text-amber-300';
        default: return 'from-slate-600 to-slate-800 shadow-slate-500/50 ring-slate-400 text-slate-300';
    }
}

// --- Feature Components ---

function CreditCardView({ card }: { card: Card }) {
  const themeClasses = getThemeClasses(card.theme || 'indigo');
  const bgColors = themeClasses.split(' ').slice(0, 2).join(' '); // get gradients

  return (
    <GlassPanel className={cn(
        "p-6 relative overflow-hidden aspect-[1.586/1] flex flex-col justify-between w-full h-full transition-all group",
        card.isFrozen ? "opacity-70 grayscale-[0.5]" : ""
    )}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-20", bgColors)} />
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-white/30 to-transparent rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
      
      <div className="flex justify-between items-start z-10">
         <div className="flex items-center gap-2">
             <CreditCard className="w-8 h-8 text-white/80" />
             <span className="text-white/40 text-xs font-bold uppercase tracking-widest">{card.network || 'visa'}</span>
         </div>
         {card.isFrozen ? (
             <Snowflake className="w-6 h-6 text-blue-300 animate-pulse" />
         ) : (
             <Target className="w-6 h-6 text-white/30 group-hover:text-white/60 transition-colors" />
         )}
      </div>
      <div className="z-10 mt-auto">
         <p className="text-white/60 text-[10px] font-semibold tracking-widest uppercase mb-1">Limit ${(card.limit || 0).toLocaleString()}</p>
         <h3 className="text-xl font-bold text-white tracking-tight truncate">{card.cardName}</h3>
         <div className="mt-4 flex justify-between items-end">
            <div>
              <p className="text-white/40 text-[9px] uppercase tracking-wider mb-0.5">Balance</p>
              <p className="text-white font-mono text-lg">${(card.currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right">
              <p className="text-white/40 text-[9px] uppercase tracking-wider mb-0.5">Avail</p>
              <p className="text-white/80 font-mono text-sm">${((card.limit || 0) - (card.currentBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
         </div>
      </div>
    </GlassPanel>
  );
}

function LoginScreen() {
  const { signIn, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setAuthLoading(true);
    try {
      if (isForgotPassword) {
        if (!email) throw new Error("Please enter your email");
        await resetPassword(email);
        setResetSent(true);
      } else if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex relative z-10 bg-slate-950">
      {/* Left Column (hidden on mobile, graphic/logo area) */}
      <div className="hidden lg:flex flex-1 xl:flex-[1.2] relative bg-[#020617] overflow-hidden items-center justify-center border-r border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-teal-500/10" />
        <div className="absolute w-[800px] h-[800px] bg-indigo-500/20 blur-[120px] rounded-full -top-40 -left-40 mix-blend-screen pointer-events-none" />
        <div className="absolute w-[600px] h-[600px] bg-teal-500/20 blur-[120px] rounded-full bottom-0 right-0 mix-blend-screen pointer-events-none" />
        
        <div className="relative z-10 flex flex-col items-center max-w-lg text-center p-12">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-teal-400 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/30">
              <Wallet className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-5xl font-light tracking-tight text-white mb-6">Liquid<span className="font-bold">Ledger</span></h1>
            <p className="text-white/50 font-medium tracking-wide text-lg leading-relaxed">
              Track wealth, monitor expenses, and maintain financial clarity across all your devices securely.
            </p>
            
            <div className="mt-16 w-full text-left space-y-4">
                <GlassPanel className="p-5 flex items-center gap-5 relative overflow-hidden group hover:border-teal-500/30 transition-colors">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl -mt-10 -mr-10 transition-transform group-hover:scale-150" />
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:bg-white/10 transition-colors">
                        <ShieldCheck className="w-6 h-6 text-teal-400" />
                    </div>
                    <div>
                        <p className="text-white font-semibold tracking-tight text-lg mb-0.5">Bank-grade Security</p>
                        <p className="text-white/40 text-sm">Your data is fully encrypted and never shared</p>
                    </div>
                </GlassPanel>
                
                <GlassPanel className="p-5 flex items-center gap-5 relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mt-10 -mr-10 transition-transform group-hover:scale-150" />
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-inner group-hover:bg-white/10 transition-colors">
                        <Smartphone className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-white font-semibold tracking-tight text-lg mb-0.5">Anywhere Access</p>
                        <p className="text-white/40 text-sm">Real-time sync mobile, tablet, and desktop</p>
                    </div>
                </GlassPanel>
            </div>
        </div>
      </div>

      {/* Right Column (Form) */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-12 pb-safe pt-safe w-full relative bg-[#020617] lg:bg-transparent">
        <div className="w-full max-w-sm mx-auto relative z-10">
            {/* Mobile Logo Only */}
            <div className="lg:hidden flex flex-col items-center mb-10 mt-8">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-teal-400 rounded-[1.5rem] flex items-center justify-center mb-5 shadow-xl shadow-indigo-500/30">
                  <Wallet className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-light tracking-tight text-white mb-2">Liquid<span className="font-bold">Ledger</span></h1>
                <p className="text-white/50 font-medium tracking-wide text-xs uppercase">Smart Expense Tracking</p>
            </div>

            <div className="mb-8 text-center lg:text-left">
                <h2 className="text-3xl font-semibold text-white tracking-tight mb-2">
                  {isForgotPassword ? 'Reset password' : isSignUp ? 'Create account' : 'Welcome back'}
                </h2>
                <p className="text-white/50 text-sm">
                  {isForgotPassword 
                    ? 'Enter your email to receive a password reset link' 
                    : 'Enter your credentials to access your dashboard'}
                </p>
            </div>

            <AnimatePresence mode="wait">
              <motion.form 
                key={isForgotPassword ? 'forgot' : isSignUp ? 'signup' : 'login'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleEmailAuth} 
                className="space-y-5 w-full"
              >
                <div>
                  <label className="block text-white/50 text-[10px] font-bold uppercase tracking-widest mb-2 ml-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white/10 transition-all placeholder:text-white/20"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                {!isForgotPassword && (
                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                        <label className="block text-white/50 text-[10px] font-bold uppercase tracking-widest">Password</label>
                        {!isSignUp && (
                          <button 
                            type="button" 
                            onClick={() => { setIsForgotPassword(true); setErrorMsg(''); setResetSent(false); }}
                            className="text-teal-400 text-xs font-semibold hover:text-teal-300 transition-colors"
                          >
                            Forgot?
                          </button>
                        )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                      <input 
                        type="password" 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white/10 transition-all placeholder:text-white/20"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                )}
                
                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <p className="text-red-400 text-xs text-center font-medium leading-relaxed">{errorMsg}</p>
                  </div>
                )}

                {resetSent && (
                  <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4">
                      <p className="text-teal-400 text-xs text-center font-medium leading-relaxed">Password reset email sent. Please check your inbox.</p>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  disabled={authLoading}
                  type="submit"
                  className="w-full bg-teal-400 hover:bg-teal-500 text-slate-900 font-bold py-4 rounded-xl mt-2 transition-colors shadow-[0_0_30px_-5px_rgba(45,212,191,0.2)] disabled:opacity-50 tracking-wide"
                >
                  {authLoading 
                    ? 'Working...' 
                    : isForgotPassword 
                      ? 'Send Reset Link' 
                      : isSignUp 
                        ? 'Create Account' 
                        : 'Sign In'
                  }
                </motion.button>
              </motion.form>
            </AnimatePresence>

            {isForgotPassword ? (
              <div className="mt-8 text-center text-white/50 text-sm">
                Remembered your password?{' '}
                <button 
                  type="button"
                  onClick={() => { setIsForgotPassword(false); setErrorMsg(''); setResetSent(false); }} 
                  className="text-teal-400 hover:text-teal-300 font-semibold transition-colors ml-1"
                >
                  Back to login
                </button>
              </div>
            ) : (
              <>
                <div className="w-full my-8 flex items-center gap-4 text-white/10">
                  <div className="flex-1 h-px bg-white/10"></div>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-white/30 flex-shrink-0">Or continue with</span>
                  <div className="flex-1 h-px bg-white/10"></div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={signIn}
                  type="button"
                  className="w-full py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-3 transition-colors group"
                >
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-white font-medium">Continue with Google</span>
                </motion.button>

                <div className="mt-10 text-center text-white/50 text-sm">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button 
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setErrorMsg('');
                    }} 
                    className="text-teal-400 hover:text-teal-300 font-semibold transition-colors ml-1"
                  >
                    {isSignUp ? 'Sign in instead' : 'Create one now'}
                  </button>
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
    const { user, updateUserName } = useAuth();
    const [name, setName] = useState(user?.displayName || '');
    const [saving, setSaving] = useState(false);
    const { addToast } = useToast();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateUserName(name);
            addToast("Profile updated", "success");
            onClose();
        } catch(e) {
            addToast("Failed to update profile", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }} 
               animate={{ opacity: 1, scale: 1 }} 
               exit={{ opacity: 0, scale: 0.95 }}
               className="relative w-full max-w-sm z-10"
            >
                <GlassPanel className="p-6 md:p-8 bg-slate-900/90 border-white/20">
                    <button type="button" onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                    <h2 className="text-2xl font-light text-white mb-6">Profile Settings</h2>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Display Name</label>
                            <input 
                                type="text" value={name} onChange={e => setName(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                            />
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            type="submit" disabled={saving}
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 rounded-xl mt-2 transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Profile'}
                        </motion.button>
                    </form>
                </GlassPanel>
            </motion.div>
        </div>
    )
}

function AddCardModal({ onClose }: { onClose: () => void }) {
  const { addCard } = useApp();
  const [cardName, setCardName] = useState('');
  const [limit, setLimit] = useState('');
  const [theme, setTheme] = useState<CardTheme>('indigo');
  const [network, setNetwork] = useState<CardNetwork>('visa');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName || !limit) return;
    setIsSubmitting(true);
    await addCard({
       cardName,
       limit: parseFloat(limit),
       theme,
       network
    });
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center md:p-4 px-2 pb-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
        onClick={onClose} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ y: '100%', scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: '100%', scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md z-10 mx-auto"
      >
        <GlassPanel className="p-6 md:p-8 overflow-hidden bg-slate-900/90 border-white/20">
          <button type="button" onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-20">
            <X className="w-6 h-6" />
          </button>
          
          <h2 className="text-2xl font-light text-white mb-6">Provision Card</h2>

          {/* Preview Preview */}
          <div className={cn(
              "w-full aspect-[1.586/1] rounded-3xl mb-8 p-5 flex flex-col justify-between relative overflow-hidden border border-white/10 bg-gradient-to-br",
              getThemeClasses(theme).split(' ').slice(0, 2).join(' '), "shadow-xl"
            )}>
             <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
             <div className="flex justify-between items-center z-10">
                 <CreditCard className="w-8 h-8 text-white/80" />
                 <span className="text-white/60 text-xs uppercase font-bold tracking-widest">{network}</span>
             </div>
             <div className="relative z-10">
                <p className="text-white/60 text-[10px] font-semibold tracking-widest uppercase mb-1">Limit ${limit ? parseFloat(limit).toLocaleString() : '0,000'}</p>
                <h3 className="text-xl font-bold text-white tracking-tight truncate">{cardName || 'Card Designation'}</h3>
             </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 md:pr-4">
             <div>
               <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Card Name</label>
               <input 
                 autoFocus type="text" required value={cardName} onChange={e => setCardName(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400"
                 placeholder="e.g., Chase Sapphire"
               />
             </div>
             <div>
               <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Credit Limit ($)</label>
               <input 
                 type="number" required value={limit} onChange={e => setLimit(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono"
                 placeholder="10000"
               />
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Network</label>
                    <div className="flex gap-2">
                        {(['visa', 'mastercard', 'amex'] as CardNetwork[]).map(n => (
                            <button
                                key={n} type="button" onClick={() => setNetwork(n)}
                                className={cn("flex-1 py-2 rounded-lg border text-xs font-bold uppercase transition-all", network === n ? "bg-white/20 border-white/40 text-white" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10")}
                            >
                                {n.slice(0, 3)}
                            </button>
                        ))}
                    </div>
                 </div>
                 <div>
                    <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Theme</label>
                    <div className="flex gap-2 items-center h-[34px]">
                        {(['indigo', 'teal', 'rose', 'amber'] as CardTheme[]).map(t => (
                            <button
                                key={t} type="button" onClick={() => setTheme(t)}
                                className={cn("w-6 h-6 rounded-full transition-all border-2", theme === t ? "scale-125 border-white" : "border-transparent opacity-50", 
                                    t === 'indigo' ? "bg-indigo-500" : t === 'teal' ? "bg-teal-500" : t === 'rose' ? "bg-rose-500" : "bg-amber-500"
                                )}
                            />
                        ))}
                    </div>
                 </div>
             </div>
             
             <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={isSubmitting}
                className="w-full bg-teal-400 hover:bg-teal-500 text-slate-900 font-bold py-4 rounded-xl mt-4 transition-colors shadow-lg shadow-teal-400/25 block"
             >
                {isSubmitting ? 'Provisioning...' : 'Add Card'}
             </motion.button>
          </form>
        </GlassPanel>
      </motion.div>
    </div>
  );
}

function CustomSelect({ 
  value, 
  onChange, 
  options, 
  className,
  buttonClassName
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: { label: string; value: string }[];
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label || 'Select...';

  return (
    <div className={cn("relative", className)}>
      <div 
        className={cn("w-full h-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white flex justify-between items-center cursor-pointer text-sm", buttonClassName)}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate pr-2">{selectedLabel}</span>
        <ChevronDown className="w-4 h-4 text-white/50 shrink-0" />
      </div>
      <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
          <motion.div 
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 bg-slate-800 border border-white/10 rounded-xl overflow-hidden z-[110] shadow-2xl max-h-60 overflow-y-auto min-w-[max-content] w-full"
          >
            {options.map(o => (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  "px-4 py-3 text-sm cursor-pointer transition-colors whitespace-nowrap",
                  value === o.value ? "bg-indigo-500/20 text-indigo-400 font-medium" : "text-white/80 hover:bg-white/10 hover:text-white"
                )}
              >
                {o.label}
              </div>
            ))}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}

function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const { activeCardId, addExpense, cards } = useApp();
  const { addToast } = useToast();
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('General');
  const [selectedCardId, setSelectedCardId] = useState(activeCardId && activeCardId !== 'all' ? activeCardId : '');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCardId || !merchant || !amount || !category) return;
    setIsSubmitting(true);
    await addExpense({
       amount: parseFloat(amount),
       merchant,
       category,
       date: new Date().toISOString(),
       cardId: selectedCardId,
       isRecurring
    });
    setIsSubmitting(false);
    onClose();
  };

  const cardOptions = cards.map(c => ({
    label: `${c.cardName} (•••• ${c.id.slice(-4)})`,
    value: c.id
  }));

  const categoryOptions = [
    { label: 'General', value: 'General' },
    { label: 'Food & Dining', value: 'Food & Dining' },
    { label: 'Electronics', value: 'Electronics' },
    { label: 'Travel', value: 'Travel' },
    { label: 'Entertainment', value: 'Entertainment' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center md:p-4 px-2 pb-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
        onClick={onClose} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ y: '100%', scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: '100%', scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg z-10 mx-auto"
      >
        <GlassPanel className="p-6 md:p-8 bg-slate-900/90 border-white/20 relative">
          <button type="button" onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-20">
            <X className="w-6 h-6" />
          </button>
          
          <h2 className="text-2xl font-light text-white mb-6">Log Expense</h2>

          <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 md:pr-4">
             <div>
               <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Card</label>
               <CustomSelect 
                 value={selectedCardId} 
                 onChange={setSelectedCardId} 
                 options={cardOptions}
               />
             </div>
             <div>
               <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Merchant Name</label>
               <input 
                 autoFocus type="text" required value={merchant} onChange={e => setMerchant(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-white/20 text-sm"
                 placeholder="e.g., Apple Store"
               />
             </div>
             <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                   <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Amount ($)</label>
                   <input 
                     type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)}
                     className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:text-white/20"
                     placeholder="0.00"
                   />
                </div>
                <div>
                   <label className="block text-white/50 text-xs font-medium uppercase tracking-wider mb-2">Category</label>
                   <CustomSelect 
                     value={category} 
                     onChange={setCategory} 
                     options={categoryOptions}
                   />
                </div>
             </div>
             
             <button 
                type="button" onClick={() => setIsRecurring(!isRecurring)}
                className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all w-full mt-2", isRecurring ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10")}
             >
                 <Repeat className={cn("w-4 h-4", isRecurring ? "animate-spin-slow" : "")} />
                 <span className="text-xs font-medium tracking-wide">Mark as Recurring Bill</span>
             </button>

             <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                type="submit" disabled={isSubmitting || !selectedCardId}
                className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 text-white font-medium py-3 rounded-xl mt-4 transition-colors shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 text-sm"
             >
                {isSubmitting ? <span className="animate-pulse">Saving...</span> : 'Record Expense'}
             </motion.button>
          </form>
        </GlassPanel>
      </motion.div>
    </div>
  );
}

function ExpenseDetailsModal({ expense, onClose }: { expense: Expense, onClose: () => void }) {
    const { deleteExpense } = useApp();
    const [confirmDelete, setConfirmDelete] = useState(false);

    const handleDelete = () => {
        deleteExpense(expense);
        onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center md:p-4 px-2 pb-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
            <motion.div 
               initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
               className="relative w-full max-w-sm z-10"
            >
                <GlassPanel className="p-8 bg-slate-900/90 border-white/20">
                    <button type="button" onClick={onClose} className="absolute top-6 right-6 text-white/50 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
                            {getCategoryIcon(expense.category)}
                        </div>
                        <h3 className="text-2xl font-semibold text-white tracking-tight leading-tight">{expense.merchant}</h3>
                        <p className="text-4xl font-light font-mono text-white mt-4 mb-2">${expense.amount.toFixed(2)}</p>
                        <p className="text-white/40 text-sm tracking-wide mb-6">
                            {expense.date && !isNaN(new Date(expense.date).getTime()) ? format(new Date(expense.date), 'MMMM do, yyyy • h:mm a') : 'Unknown Date'}
                        </p>
                    </div>

                    <div className="space-y-3 bg-black/20 rounded-2xl p-4 mb-6 text-sm">
                         <div className="flex justify-between">
                             <span className="text-white/40">Category</span>
                             <span className="text-white">{expense.category}</span>
                         </div>
                         {expense.isRecurring && (
                             <div className="flex justify-between text-indigo-400 font-medium">
                                 <span>Subscription</span>
                                 <span>Monthly</span>
                             </div>
                         )}
                         <div className="flex justify-between">
                             <span className="text-white/40">Status</span>
                             <span className="text-teal-400">Cleared</span>
                         </div>
                    </div>

                    {confirmDelete ? (
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors">Cancel</button>
                            <button onClick={handleDelete} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors">Confirm</button>
                        </div>
                    ) : (
                        <button onClick={() => setConfirmDelete(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" /> Delete Transaction
                        </button>
                    )}
                </GlassPanel>
            </motion.div>
        </div>
    )
}

function Dashboard() {
  const { user, signOut } = useAuth();
  const { cards, expenses, activeCardId, setActiveCardId, deleteCard, toggleCardFreeze } = useApp();
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const { addToast } = useToast();

  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'month' | 'last_month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'date' | 'amount_desc' | 'amount_asc'>('date');

  const deckRef = useRef<HTMLDivElement>(null);

  const isAllCardsMode = activeCardId === 'all';
  const activeCard = isAllCardsMode ? null : (cards.find(c => c.id === activeCardId) || cards[0]);
  const activeCardIdSafe = isAllCardsMode ? 'all' : activeCard?.id;

  const activeCardExpenses = useMemo(() => {
    let filtered = isAllCardsMode ? expenses : expenses.filter(e => e.cardId === activeCardIdSafe);
    
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(e => e.merchant.toLowerCase().includes(s) || e.category.toLowerCase().includes(s));
    }

    if (timeFilter === 'month') {
        filtered = filtered.filter(e => e.date && !isNaN(new Date(e.date).getTime()) && isThisMonth(new Date(e.date)));
    } else if (timeFilter === 'last_month') {
        filtered = filtered.filter(e => e.date && !isNaN(new Date(e.date).getTime()) && isSameMonth(new Date(e.date), subMonths(new Date(), 1)));
    } else if (timeFilter === 'custom' && customStartDate && customEndDate) {
        const start = new Date(customStartDate).getTime();
        const end = new Date(customEndDate).getTime() + 86399999; // include the whole end day
        filtered = filtered.filter(e => {
            if (!e.date || isNaN(new Date(e.date).getTime())) return false;
            const t = new Date(e.date).getTime();
            return t >= start && t <= end;
        });
    }

    if (sortOrder === 'amount_desc') filtered.sort((a,b) => b.amount - a.amount);
    if (sortOrder === 'amount_asc') filtered.sort((a,b) => a.amount - b.amount);

    return filtered;
  }, [expenses, activeCardIdSafe, isAllCardsMode, search, timeFilter, customStartDate, customEndDate, sortOrder]);

  const availableCredit = isAllCardsMode
    ? cards.reduce((acc, c) => acc + ((c.limit || 0) - (c.currentBalance || 0)), 0)
    : (activeCard ? (activeCard.limit || 0) - (activeCard.currentBalance || 0) : 0);

  const balance = isAllCardsMode
    ? cards.reduce((acc, c) => acc + (c.currentBalance || 0), 0)
    : (activeCard ? (activeCard.currentBalance || 0) : 0);
  
  // Aggregate data for charts
  const categoryData = useMemo(() => {
      const map = new Map<string, number>();
      activeCardExpenses.forEach(e => {
          map.set(e.category, (map.get(e.category) || 0) + e.amount);
      });
      const data = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
      data.sort((a,b) => b.value - a.value);
      return data;
  }, [activeCardExpenses]);

  const COLORS = ['#6366f1', '#14b8a6', '#f43f5e', '#f59e0b', '#8b5cf6', '#ec4899'];

  const scrollDeck = (dir: 'left' | 'right') => {
      if (!deckRef.current) return;
      const amount = 320;
      deckRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  const exportPDF = () => {
      const doc = new jsPDF();
      const statementName = isAllCardsMode ? 'All Cards' : (activeCard?.cardName || 'Card');
      doc.text(`Expense Statement - ${statementName}`, 14, 15);
      
      autoTable(doc, {
          startY: 20,
          head: [isAllCardsMode ? ['Date', 'Card', 'Merchant', 'Category', 'Recurring', 'Amount'] : ['Date', 'Merchant', 'Category', 'Recurring', 'Amount']],
          body: activeCardExpenses.map(e => {
              const row: any[] = [
                  e.date ? format(new Date(e.date), 'yyyy-MM-dd HH:mm') : 'Unknown',
                  e.merchant,
                  e.category,
                  e.isRecurring ? 'Yes' : 'No',
                  `$${e.amount.toFixed(2)}`
              ];
              if (isAllCardsMode) {
                  row.splice(1, 0, cards.find(c => c.id === e.cardId)?.cardName || 'Unknown');
              }
              return row;
          }),
          theme: 'grid',
          headStyles: { fillColor: [99, 102, 241] } // indigo-500
      });
      
      const fileNameStr = isAllCardsMode ? 'all_cards' : (activeCard?.cardName || 'card');
      doc.save(`statement_${fileNameStr}.pdf`);
      addToast("Exported to PDF", "success");
  }

  const exportCSV = () => {
      const csv = Papa.unparse(activeCardExpenses.map(e => {
          const row: any = {
              Date: e.date ? format(new Date(e.date), 'yyyy-MM-dd HH:mm') : '',
          };
          if (isAllCardsMode) {
              row.Card = cards.find(c => c.id === e.cardId)?.cardName || 'Unknown';
          }
          row.Merchant = e.merchant;
          row.Amount = e.amount;
          row.Category = e.category;
          row.Recurring = e.isRecurring ? 'Yes' : 'No';
          return row;
      }));
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      const fileNameStr = isAllCardsMode ? 'all_cards' : (activeCard?.cardName || 'card');
      a.setAttribute('download', `statement_${fileNameStr}.csv`);
      a.click();
      addToast("Exported to CSV", "success");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-safe relative z-10 min-h-[100dvh] flex flex-col pt-safe">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
           <h2 className="text-3xl font-light tracking-tight text-white mb-1 flex items-center gap-3">
             Hello, <span className="font-semibold cursor-pointer hover:text-indigo-300 transition-colors" onClick={() => setSettingsOpen(true)}>
                 {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User'}
             </span>
           </h2>
           <p className="text-white/50 text-sm font-medium tracking-wide">
             {format(new Date(), 'EEEE, MMMM do')}
           </p>
        </div>
        <div className="flex gap-3">
            <motion.button 
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setSettingsOpen(true)}
            className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
            <Settings className="w-5 h-5" />
            </motion.button>
            <motion.button 
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={signOut}
            className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-red-400/50 hover:text-red-400 transition-colors"
            >
            <LogOut className="w-5 h-5 ml-1" />
            </motion.button>
        </div>
      </header>

      {/* Main Content Area */}
      {cards.length > 0 ? (
        <>
          {/* Card Deck Switcher */}
          <div className="relative mb-6">
              <button onClick={() => scrollDeck('left')} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50 hover:text-white hidden md:flex"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => scrollDeck('right')} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/50 hover:text-white hidden md:flex"><ChevronRight className="w-5 h-5" /></button>
              
              <div ref={deckRef} className="flex gap-4 overflow-x-auto pb-6 snap-x snap-mandatory pt-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                <motion.div
                    onClick={() => setActiveCardId('all')}
                    className={cn(
                    "snap-center shrink-0 w-[300px] sm:w-[340px] cursor-pointer transition-all duration-500 rounded-3xl", 
                    activeCardIdSafe === 'all' 
                        ? "ring-2 ring-white/30 scale-100" 
                        : "opacity-40 hover:opacity-80 scale-95"
                    )}
                >
                    <GlassPanel className="p-6 relative overflow-hidden aspect-[1.586/1] flex flex-col justify-center items-center w-full h-full transition-all bg-gradient-to-br from-slate-800 to-slate-900 border border-white/5">
                        <Wallet className="w-12 h-12 text-white/50 mb-4" />
                        <h3 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent tracking-tight text-center">All Cards</h3>
                        <p className="text-white/40 text-[10px] uppercase tracking-wider mt-2">Combined View</p>
                    </GlassPanel>
                </motion.div>
                {cards.map(card => (
                    <motion.div 
                        key={card.id} onClick={() => setActiveCardId(card.id)}
                        className={cn(
                        "snap-center shrink-0 w-[300px] sm:w-[340px] cursor-pointer transition-all duration-500 rounded-3xl", 
                        activeCardIdSafe === card.id 
                            ? "ring-2 ring-white/30 scale-100" 
                            : "opacity-40 hover:opacity-80 scale-95"
                        )}
                    >
                        <CreditCardView card={card} />
                    </motion.div>
                ))}
                <motion.button
                    onClick={() => setAddCardOpen(true)}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="snap-center shrink-0 w-[300px] sm:w-[340px] aspect-[1.586/1] rounded-3xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/50 hover:text-white hover:border-white/40 transition-colors bg-white/5 backdrop-blur-md"
                >
                    <Plus className="w-8 h-8 mb-3 text-indigo-400" />
                    <span className="font-semibold tracking-widest uppercase text-[11px]">Provision Card</span>
                </motion.button>
              </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
              {/* Left Column: Metrics & Actions */}
              <div className="lg:col-span-5 space-y-6">
                 <div className="grid grid-cols-2 gap-4">
                    <GlassPanel className="p-6 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><PieChartIcon className="w-20 h-20" /></div>
                        <p className="text-white/40 text-[10px] font-semibold tracking-widest uppercase mb-2">Current Balance</p>
                        <p className="text-3xl font-light tracking-tight text-white font-mono flex items-start truncate">
                        <span className="text-lg mt-1 text-white/50 mr-1">$</span>{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </GlassPanel>
                    <GlassPanel className="p-6 overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Target className="w-20 h-20 text-teal-400" /></div>
                        <p className="text-white/40 text-[10px] font-semibold tracking-widest uppercase mb-2">Available Credit</p>
                        <p className="text-3xl font-light tracking-tight text-teal-300 font-mono flex items-start truncate">
                        <span className="text-lg mt-1 text-teal-300/50 mr-1">$</span>{availableCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </GlassPanel>
                 </div>

                 <GlassPanel className="p-6">
                     <p className="text-white/50 text-xs font-semibold tracking-widest uppercase mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400"/> Smart Insights</p>
                     {activeCardExpenses.length > 0 ? (
                         <div className="space-y-3">
                             <div className="bg-white/5 rounded-xl p-4 text-sm leading-relaxed text-white/80">
                                 Your highest spend this period is <strong className="text-white">{categoryData[0]?.name || 'Unknown'}</strong>. 
                                 You've logged {activeCardExpenses.filter(e => e.isRecurring).length} recurring bills on this card.
                             </div>
                             <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                 <motion.div 
                                     initial={{ width: 0 }}
                                     animate={{ width: `${Math.min(100, (balance / (activeCard?.limit || 1)) * 100)}%` }}
                                     className={cn("h-full", (balance / (activeCard?.limit || 1)) > 0.8 ? "bg-red-500" : "bg-indigo-400")} 
                                />
                             </div>
                             <p className="text-[10px] text-right text-white/40 uppercase tracking-widest mt-1">Utilization: {((balance / (activeCard?.limit || 1)) * 100).toFixed(1)}%</p>
                         </div>
                     ) : (
                         <p className="text-white/40 text-sm">Not enough data to generate insights.</p>
                     )}
                 </GlassPanel>

                 {/* Card Controls */}
                 <div className="flex gap-3">
                     <button 
                        onClick={() => toggleCardFreeze(activeCard!.id)}
                        className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                     >
                         <Snowflake className={cn("w-4 h-4", activeCard?.isFrozen ? "text-blue-400" : "text-white/50")} /> 
                         {activeCard?.isFrozen ? "Unfreeze" : "Freeze"} Card
                     </button>
                     <button 
                        onClick={() => { if(confirm("Delete this card forever?")) deleteCard(activeCard!.id); }}
                        className="flex-1 bg-white/5 border border-white/10 hover:bg-red-500/20 hover:text-red-400 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                     >
                         <Trash2 className="w-4 h-4" /> Terminate
                     </button>
                 </div>
              </div>

              {/* Right Column: Chart */}
              <div className="lg:col-span-7">
                  <GlassPanel className="h-full p-6 flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                         <p className="text-white/50 text-xs font-semibold tracking-widest uppercase flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Spend Analytics</p>
                         <button onClick={exportCSV} className="text-white/40 hover:text-white transition-colors" title="Export CSV"><Download className="w-4 h-4" /></button>
                      </div>
                      
                      <div className="flex-1 w-full min-h-[250px] flex items-center justify-center">
                          {categoryData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={categoryData} innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                                    {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                  </Pie>
                                  <Tooltip 
                                    formatter={(value: number) => `$${value.toFixed(2)}`}
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                          ) : (
                              <div className="flex flex-col items-center opacity-30">
                                  <PieChartIcon className="w-12 h-12 mb-2" />
                                  <p className="text-sm">No expenses to visualize</p>
                              </div>
                          )}
                      </div>
                      
                      {categoryData.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-4 mt-4">
                              {categoryData.map((d, i) => (
                                  <div key={d.name} className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/70">
                                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} /> {d.name}
                                  </div>
                              ))}
                          </div>
                      )}
                  </GlassPanel>
              </div>
          </div>

          {/* Ledger Actions & Filters */}
          <div className="flex flex-col mb-6 gap-4">
             <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
                 <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                     <div className="relative flex-1 md:w-64 min-w-[200px]">
                         <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                         <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} 
                                className="bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm w-full outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-white/30" 
                         />
                     </div>
                     <CustomSelect 
                         value={timeFilter} 
                         onChange={e => setTimeFilter(e as any)} 
                         options={[
                           { label: 'All Time', value: 'all' },
                           { label: 'This Month', value: 'month' },
                           { label: 'Last Month', value: 'last_month' },
                           { label: 'Custom Range', value: 'custom' },
                         ]}
                         className="hidden sm:block"
                         buttonClassName="rounded-full"
                     />
                     
                     <div className="flex sm:hidden w-full gap-2 mt-1">
                         <CustomSelect 
                             value={timeFilter} 
                             onChange={e => setTimeFilter(e as any)} 
                             options={[
                               { label: 'All Time', value: 'all' },
                               { label: 'This Month', value: 'month' },
                               { label: 'Last Month', value: 'last_month' },
                               { label: 'Custom Range', value: 'custom' },
                             ]}
                             className="flex-1"
                             buttonClassName="rounded-full"
                         />
                         <CustomSelect 
                             value={sortOrder} 
                             onChange={e => setSortOrder(e as any)} 
                             options={[
                               { label: 'Newest First', value: 'date' },
                               { label: 'Highest Amount', value: 'amount_desc' },
                               { label: 'Lowest Amount', value: 'amount_asc' },
                             ]}
                             className="flex-1"
                             buttonClassName="rounded-full"
                         />
                     </div>
                 </div>

                 <div className="flex gap-2 w-full md:w-auto">
                     <CustomSelect 
                         value={sortOrder} 
                         onChange={e => setSortOrder(e as any)} 
                         options={[
                           { label: 'Newest First', value: 'date' },
                           { label: 'Highest', value: 'amount_desc' },
                           { label: 'Lowest', value: 'amount_asc' },
                         ]}
                         className="hidden sm:block w-40"
                         buttonClassName="rounded-full"
                     />
                     
                     <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0 justify-end">
                         <motion.button
                            onClick={exportCSV} title="Export CSV"
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            className="bg-white/5 hover:bg-white/10 shrink-0 text-white w-10 h-10 rounded-full transition-colors flex items-center justify-center border border-white/10"
                         >
                            <Download className="w-4 h-4" />
                         </motion.button>
                         <motion.button
                            onClick={exportPDF} title="Export PDF"
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            className="bg-white/5 hover:bg-white/10 shrink-0 text-white w-10 h-10 rounded-full transition-colors flex items-center justify-center border border-white/10"
                         >
                            <FileText className="w-4 h-4 ml-0.5" />
                         </motion.button>
                         <motion.button
                            onClick={() => setAddExpenseOpen(true)}
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            className="hidden md:flex bg-indigo-500 hover:bg-indigo-600 shrink-0 text-white px-5 py-2 rounded-full font-medium text-sm transition-colors items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
                         >
                            <Plus className="w-4 h-4" /> <span>Log Expense</span>
                         </motion.button>
                     </div>
                 </div>
             </div>
             
             {timeFilter === 'custom' && (
                 <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
                     <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-sm text-white/80 focus:outline-none focus:border-indigo-500 [color-scheme:dark]" />
                     <span className="text-white/40 text-sm">to</span>
                     <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-sm text-white/80 focus:outline-none focus:border-indigo-500 [color-scheme:dark]" />
                 </motion.div>
             )}
          </div>

          {/* Ledger List */}
          <div className="space-y-3 pb-20 min-h-[40vh]">
             {activeCardExpenses.length === 0 ? (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-10 flex flex-col items-center justify-center text-center border-2 border-dashed border-white/10 rounded-3xl">
                    <div className="w-16 h-16 bg-white/5 rounded-full border border-white/10 flex items-center justify-center mb-4">
                       <Receipt className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white/70 font-medium text-lg">Clean Slate</p>
                    <p className="text-white/40 text-sm mt-1">No transactions match your current filters.</p>
                 </motion.div>
             ) : (
                 <AnimatePresence mode="popLayout">
                    {activeCardExpenses.map(expense => (
                        <motion.div 
                           layout
                           key={expense.id}
                           initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                           transition={{ duration: 0.2 }}
                           onClick={() => setSelectedExpense(expense)}
                        >
                           <GlassPanel className="p-4 md:p-5 flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-indigo-300 shadow-inner group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300 relative">
                                    {getCategoryIcon(expense.category)}
                                    {expense.isRecurring && <Repeat className="w-3 h-3 absolute -bottom-1 -right-1 text-teal-400 bg-slate-900 rounded-full" />}
                                 </div>
                                 <div>
                                    <p className="text-white font-medium text-base truncate max-w-[150px] sm:max-w-[300px]">{expense.merchant}</p>
                                    <p className="text-white/40 text-xs mt-0.5 tracking-wide flex items-center md:inline-flex flex-wrap gap-1 md:gap-0">
                                       <span>{expense.date && !isNaN(new Date(expense.date).getTime()) 
                                          ? format(new Date(expense.date), 'MMM dd • h:mm a') 
                                          : 'Unknown Date'}</span>
                                       {isAllCardsMode && <span className="md:ml-2 text-white/60 bg-white/10 px-1.5 py-0.5 rounded text-[10px] md:bg-transparent md:px-0 md:py-0 md:text-indigo-300"> • {cards.find(c => c.id === expense.cardId)?.cardName || 'Unknown Card'}</span>}
                                    </p>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <p className="text-white font-medium text-lg md:text-xl font-mono">${expense.amount.toFixed(2)}</p>
                                 <p className="text-teal-400/80 text-[10px] uppercase tracking-widest mt-1 font-semibold">{expense.category}</p>
                              </div>
                           </GlassPanel>
                        </motion.div>
                    ))}
                 </AnimatePresence>
             )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
              <div className="absolute inset-0 bg-indigo-500 blur-[80px] opacity-20 rounded-full" />
              <Wallet className="w-24 h-24 text-white/20 mb-8 relative z-10" />
            </motion.div>
            <h3 className="text-3xl font-light text-white mb-3">No Wallets Connected</h3>
            <p className="text-white/50 mb-10 max-w-sm text-sm leading-relaxed">Let's get started by provisioning your first virtual card to track your expenses natively.</p>
            <motion.button
                onClick={() => setAddCardOpen(true)}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-4 rounded-full font-bold transition-colors shadow-[0_0_30px_-5px_rgba(99,102,241,0.5)] flex items-center gap-2"
            >
                <Plus className="w-5 h-5" /> Provision First Card
            </motion.button>
        </div>
      )}

      {/* Floating Action Button (Mobile) */}
      {cards.length > 0 && activeCard && (
          <motion.button
              onClick={() => setAddExpenseOpen(true)}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="md:hidden fixed bottom-8 right-6 w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 z-40 pb-safe-offset"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
              <Plus className="w-6 h-6" />
          </motion.button>
      )}

      {/* Render Modals securely */}
      <AnimatePresence>
        {addCardOpen && <AddCardModal onClose={() => setAddCardOpen(false)} />}
        {addExpenseOpen && <AddExpenseModal onClose={() => setAddExpenseOpen(false)} />}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        {selectedExpense && <ExpenseDetailsModal expense={selectedExpense} onClose={() => setSelectedExpense(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Loader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center text-white relative z-10">
      <div className="animate-pulse flex flex-col items-center gap-4">
         <div className="w-12 h-12 rounded-full border-t-2 border-indigo-500 border-r-2 border-transparent animate-spin" />
         <p className="text-white/40 text-xs tracking-widest uppercase font-semibold">Authenticating...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <LoginScreen />;
  
  return (
    <AppProvider user={user}>
      <Dashboard />
    </AppProvider>
  );
}

function BackgroundOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
       <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] bg-indigo-600 rounded-full blur-[120px] opacity-20 mix-blend-screen animate-[pulse_10s_ease-in-out_infinite]" />
       <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] max-w-[800px] max-h-[800px] bg-teal-500 rounded-full blur-[120px] opacity-10 mix-blend-screen animate-[pulse_14s_ease-in-out_infinite]" />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <div className="bg-[#020617] text-white min-h-[100dvh] w-full relative overflow-x-hidden font-sans selection:bg-indigo-500/30 flex flex-col">
          <BackgroundOrbs />
          <div className="flex-1">
            <AppContent />
          </div>
          <div className="w-full py-4 text-center z-10 relative pointer-events-none">
            <p className="text-white/20 text-[10px] uppercase font-bold tracking-widest">
              Made by Rithwik Tellakula
            </p>
          </div>
        </div>
      </AuthProvider>
    </ToastProvider>
  );
}
