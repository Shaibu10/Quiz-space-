/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  GraduationCap, 
  Layout, 
  RefreshCcw, 
  Trophy, 
  X,
  XCircle,
  ArrowLeft,
  Info,
  LogIn,
  LogOut,
  Medal,
  User as UserIcon,
  Share2,
  Check,
  Plus,
  Trash2,
  Edit,
  FileText,
  Upload,
  Settings,
  Users,
  Phone,
  Mail,
  UserCircle,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  UserX,
  UserCheck,
  MoreVertical,
  Printer,
  Eye,
  Lock,
  Key,
  WifiOff
} from 'lucide-react';
import { Quiz, Category } from './types';
import { 
  auth, 
  db, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from './firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where,
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  updateDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', isDanger = false }: { 
  isOpen: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void; 
  confirmText?: string; 
  cancelText?: string; 
  isDanger?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl p-8 space-y-6"
      >
        <div className="space-y-2">
          <h3 className="text-xl font-bold tracking-tight">{title}</h3>
          <p className="text-black/50 leading-relaxed text-sm">{message}</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-2xl font-semibold text-black/40 hover:bg-black/5 transition-colors text-sm"
          >
            {cancelText}
          </button>
          <button 
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`flex-1 px-4 py-3 rounded-2xl font-semibold text-white transition-all shadow-lg text-sm ${isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 ${bgColor} text-white px-6 py-3 rounded-2xl shadow-2xl z-[110] font-medium flex items-center gap-3 text-sm whitespace-nowrap`}
    >
      {type === 'success' && <CheckCircle2 className="w-5 h-5" />}
      {type === 'error' && <ShieldAlert className="w-5 h-5" />}
      {type === 'info' && <Info className="w-5 h-5" />}
      <span>{message}</span>
    </motion.div>
  );
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code;
  
  // Don't crash the app for temporary offline, network, or connection errors
  const isOfflineOrConnectionError = 
    errorCode === 'unavailable' || 
    errorCode === 'deadline-exceeded' ||
    errorMessage.includes('client is offline') || 
    errorMessage.includes('Could not reach Cloud Firestore backend') ||
    errorMessage.toLowerCase().includes('unavailable') ||
    errorMessage.toLowerCase().includes('unreachable') ||
    errorMessage.toLowerCase().includes('network') ||
    errorMessage.toLowerCase().includes('connection') ||
    errorMessage.toLowerCase().includes('could not reach') ||
    errorMessage.includes('The operation could not be completed');

  if (isOfflineOrConnectionError) {
    console.warn(`Firestore network issue/offline during ${operationType} on ${path}. Operating in offline mode. Details:`, errorMessage);
    // Dispatch a custom event to notify components of the connectivity status
    window.dispatchEvent(new CustomEvent('firestore-connection-status', { detail: { online: false, error: errorMessage } }));
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ErrorBoundary: any = class extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    const state = (this as any).state;
    if (state.hasError) {
      let parsedError;
      try {
        parsedError = JSON.parse(state.errorInfo || '');
      } catch {
        parsedError = { error: state.errorInfo };
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-6 border border-red-100">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto">
              <XCircle className="text-red-600 w-8 h-8" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-gray-900">Something went wrong</h2>
              <p className="text-gray-500">We encountered an error while processing your request.</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl overflow-auto max-h-40 text-xs font-mono text-gray-600">
              {JSON.stringify(parsedError, null, 2)}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-4 rounded-xl font-semibold hover:bg-red-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// --- Components ---

interface LeaderboardEntry {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string;
  quizId: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  accuracy: number;
  timeTaken: number;
  createdAt: any;
}

interface LeaderboardProps {
  quizzes: Quiz[];
}

function Leaderboard({ quizzes }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuizId, setSelectedQuizId] = useState<string | 'all'>('all');

  useEffect(() => {
    setLoading(true);
    let q;
    if (selectedQuizId === 'all') {
      q = query(
        collection(db, 'scores'), 
        orderBy('score', 'desc'), 
        orderBy('createdAt', 'asc'), 
        orderBy('timeTaken', 'asc'), 
        limit(10)
      );
    } else {
      q = query(
        collection(db, 'scores'), 
        where('quizId', '==', selectedQuizId),
        orderBy('score', 'desc'), 
        orderBy('createdAt', 'asc'), 
        orderBy('timeTaken', 'asc'), 
        limit(10)
      );
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newEntries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LeaderboardEntry[];
      setEntries(newEntries);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'scores');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedQuizId]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xl font-medium flex items-center gap-2">
            <Medal className="text-amber-500 w-5 h-5" />
            Global Leaderboard
          </h3>
          <span className="text-[10px] font-bold text-black/20 uppercase tracking-widest">Top 10 Performers</span>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 px-2 scrollbar-hide -mx-2">
          <button
            onClick={() => setSelectedQuizId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedQuizId === 'all' 
                ? 'bg-black text-white border-black shadow-md' 
                : 'bg-white text-black/40 border-black/5 hover:bg-black/5'
            }`}
          >
            All Quizzes
          </button>
          {quizzes.map((quiz, qIdx) => (
            <button
              key={`${quiz.id}-${qIdx}`}
              onClick={() => setSelectedQuizId(quiz.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                selectedQuizId === quiz.id 
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' 
                  : 'bg-white text-black/40 border-black/5 hover:bg-black/5'
              }`}
            >
              {quiz.title.split(':')[0]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-black/5 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, idx) => (
          <motion.div 
            key={`${entry.id}-${idx}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-white p-4 rounded-2xl border border-black/5 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm ${
                idx === 0 ? 'bg-amber-100 text-amber-600' :
                idx === 1 ? 'bg-slate-100 text-slate-600' :
                idx === 2 ? 'bg-orange-100 text-orange-600' :
                'bg-black/5 text-black/40'
              }`}>
                {idx + 1}
              </div>
              <div className="flex items-center gap-3">
                {entry.photoURL ? (
                  <img src={entry.photoURL} alt={entry.displayName} className="w-10 h-10 rounded-full border border-black/5" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <UserIcon className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-sm leading-none">{entry.displayName}</p>
                  <p className="text-[10px] text-black/30 mt-1 uppercase tracking-wider">{entry.quizTitle}</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-600 leading-none">{entry.score}/{entry.totalQuestions}</p>
              <p className="text-[10px] text-black/30 mt-1">{Math.floor(entry.timeTaken / 60)}m {entry.timeTaken % 60}s</p>
            </div>
          </motion.div>
        ))}
        {entries.length === 0 && (
          <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-black/10">
            <p className="text-black/30 text-sm">No records yet. Be the first!</p>
          </div>
        )}
      </div>
    )}
  </div>
);
}

function ProfileModal({ userProfile, onClose, showToast }: { 
  userProfile: any, 
  onClose: () => void,
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [formData, setFormData] = useState({
    displayName: userProfile?.displayName || '',
    email: userProfile?.email || '',
    phoneNumber: userProfile?.phoneNumber || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', userProfile.uid), {
        ...formData,
        updatedAt: serverTimestamp()
      });
      onClose();
      showToast('Profile updated successfully!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userProfile.uid}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-8 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Edit Profile</h2>
            <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
              <XCircle className="w-6 h-6 text-black/20" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-black/20 uppercase tracking-widest">Display Name</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/20" />
                <input 
                  type="text" 
                  required
                  value={formData.displayName}
                  onChange={e => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                  className="w-full bg-black/5 border-none rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Your name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-black/20 uppercase tracking-widest">Email Address (Optional)</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/20" />
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full bg-black/5 border-none rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="email@example.com"
                />
              </div>
              <p className="text-[10px] text-black/30 px-2">This email can be used for admin identification.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-black/20 uppercase tracking-widest">Phone Number (Optional)</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/20" />
                <input 
                  type="tel" 
                  value={formData.phoneNumber}
                  onChange={e => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  className="w-full bg-black/5 border-none rounded-2xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AdminDashboard({ customQuizzes, categories, showToast, showConfirm, globalSettings }: { 
  customQuizzes: Quiz[],
  categories: Category[],
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void,
  showConfirm: (options: Omit<ConfirmState, 'isOpen'>) => void,
  globalSettings: any
}) {
  const [activeTab, setActiveTab] = useState<'quizzes' | 'users' | 'leaderboard' | 'categories' | 'settings'>('quizzes');
  const [isCreating, setIsCreating] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [newQuiz, setNewQuiz] = useState<Partial<Quiz>>({
    title: '',
    description: '',
    timeLimit: 600,
    questions: [],
    category: categories[0]?.name || 'General'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  
  // Category Management State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryRequiresAccessCode, setNewCategoryRequiresAccessCode] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryRequiresAccessCode, setEditCategoryRequiresAccessCode] = useState(false);
  
  // New User Management State
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');

  // Leaderboard Export State
  const [exportQuizId, setExportQuizId] = useState<string>('all');
  const [exportLimit, setExportLimit] = useState<number>(50);
  const [exportData, setExportData] = useState<any[]>([]);
  const [isFetchingExport, setIsFetchingExport] = useState(false);
  const [clearCategory, setClearCategory] = useState<string>('all');
  const [isClearing, setIsClearing] = useState(false);

  // Detailed Review State
  const [selectedScoreForReview, setSelectedScoreForReview] = useState<any | null>(null);

  const handlePrintUserDetails = (entry: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocked. Please allow popups to print.', 'error');
      return;
    }

    let qList = entry.questions || [];
    let uAnswers = entry.userAnswers || [];

    // try to fall back to customQuizzes
    if (qList.length === 0) {
      const originalQuiz = customQuizzes.find(q => q.id === entry.quizId);
      if (originalQuiz) {
        qList = originalQuiz.questions || [];
      }
    }

    const accuracy = entry.accuracy ?? Math.round((entry.score / (qList.length || 1)) * 100);
    const dateStr = entry.createdAt?.seconds ? new Date(entry.createdAt.seconds * 1000).toLocaleString() : 'N/A';
    const hasDetailedAnswers = uAnswers.length > 0;

    const renderAnswersList = () => {
      if (qList.length === 0) {
        return `<p style="color: #ef4444; font-weight: 500;">No questions database data available for this quiz.</p>`;
      }

      return qList.map((q: any, idx: number) => {
        const uAns = uAnswers[idx];
        const hasUserAnswer = uAns !== undefined && uAns !== null;
        
        let isUserCorrect = false;
        if (q.type === 'fill_in_the_blank') {
          const correctAnsText = q.correctAnswerText || '';
          const userAnsText = String(uAns || '').trim().toLowerCase();
          const possibleAnswers = correctAnsText.split(',').map(a => a.trim().toLowerCase());
          isUserCorrect = possibleAnswers.includes(userAnsText);
        } else {
          isUserCorrect = hasUserAnswer && uAns === q.correctAnswer;
        }

        if (q.type === 'fill_in_the_blank') {
          let badgeHtml = '';
          let resultStyle = 'padding: 10px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #f3f4f6; background-color: #fff; color: #4b5563;';
          if (hasUserAnswer) {
            if (isUserCorrect) {
              resultStyle = 'padding: 10px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #10b981; background-color: #d1fae5; color: #065f46; font-weight: 600;';
              badgeHtml = ' <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; background-color: #10b981; color: #fff; margin-left: 8px;">[Correct]</span>';
            } else {
              resultStyle = 'padding: 10px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #fca5a5; background-color: #fef2f2; color: #991b1b; font-weight: 500;';
              badgeHtml = ' <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; background-color: #ef4444; color: #fff; margin-left: 8px;">[Incorrect]</span>';
            }
          }

          return `
            <div class="question-block" style="border: 1px solid #f3f4f6; background-color: #fcfcfc; padding: 20px; border-radius: 12px; margin-bottom: 20px; page-break-inside: avoid;">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 500; color: #111827;">Question ${idx + 1} (Fill in): ${q.text}</h3>
              <div style="${resultStyle}">
                <strong>Student Answer:</strong> ${hasUserAnswer ? `"${uAns}"` : '<em>No Answer</em>'} ${badgeHtml}
              </div>
              <div style="padding: 10px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #34d399; background-color: #ecfdf5; color: #065f46; font-weight: 500;">
                <strong>Correct Answer(s):</strong> ${q.correctAnswerText || 'N/A'}
              </div>
              ${q.explanation ? `<p style="font-size: 13px; color: #6b7280; margin: 12px 0 0 0; padding-top: 12px; border-top: 1px dashed #e5e7eb;"><strong>Explanation:</strong> <em>${q.explanation}</em></p>` : ''}
            </div>
          `;
        }

        return `
          <div class="question-block" style="border: 1px solid #f3f4f6; background-color: #fcfcfc; padding: 20px; border-radius: 12px; margin-bottom: 20px; page-break-inside: avoid;">
            <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 500; color: #111827;">Question ${idx + 1}: ${q.text}</h3>
            <ul style="list-style: none; padding: 0; margin: 0 0 12px 0;">
              ${q.options.map((opt: string, optIdx: number) => {
                let liStyle = 'padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #f3f4f6; background-color: #fff; color: #4b5563; display: flex; justify-content: space-between; align-items: center;';
                let badgeHtml = '';

                if (optIdx === q.correctAnswer) {
                  liStyle = 'padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #34d399; background-color: #ecfdf5; color: #065f46; font-weight: 500; display: flex; justify-content: space-between; align-items: center;';
                  badgeHtml = ' <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; background-color: #d1fae5; color: #065f46;">(Correct Answer)</span>';
                }

                if (hasUserAnswer && optIdx === uAns) {
                  if (isUserCorrect) {
                     liStyle = 'padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #10b981; background-color: #d1fae5; color: #065f46; font-weight: 600; display: flex; justify-content: space-between; align-items: center;';
                     badgeHtml = ' <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; background-color: #10b981; color: #fff;">[Selected • Correct]</span>';
                  } else {
                     liStyle = 'padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; font-size: 14px; border: 1px solid #fca5a5; background-color: #fef2f2; color: #991b1b; font-weight: 500; display: flex; justify-content: space-between; align-items: center;';
                     badgeHtml = ' <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; background-color: #ef4444; color: #fff;">[Selected • Incorrect]</span>';
                  }
                }

                return `<li style="${liStyle}"><span>${opt}</span>${badgeHtml}</li>`;
              }).join('')}
            </ul>
            ${q.explanation ? `<p style="font-size: 13px; color: #6b7280; margin: 12px 0 0 0; padding-top: 12px; border-top: 1px dashed #e5e7eb;"><strong>Explanation:</strong> <em>${q.explanation}</em></p>` : ''}
          </div>
        `;
      }).join('');
    };

    const htmlStr = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Quiz Report - ${entry.displayName}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              padding: 40px; 
              color: #1a1a1a; 
              line-height: 1.5; 
              background-color: #fff;
            }
            .container { max-width: 800px; margin: 0 auto; }
            .header {
              border-bottom: 2px solid #e5e7eb;
              padding-bottom: 20px;
              margin-bottom: 30px;
              text-align: center;
            }
            .platform-title {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.15em;
              color: #059669;
              margin-bottom: 4px;
            }
            h1 { font-size: 26px; font-weight: 700; margin: 0 0 10px 0; color: #111827; }
            
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              padding: 24px;
              border-radius: 16px;
              margin-bottom: 35px;
            }
            .meta-item { display: flex; flex-direction: column; }
            .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 4px; }
            .meta-value { font-size: 15px; font-weight: 600; color: #111827; }
            
            h2 { font-size: 18px; font-weight: 600; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px; margin-bottom: 20px; color: #1f2937; }
            
            .info-banner {
              background-color: #fffbeb;
              border: 1px dashed #fcd34d;
              color: #78350f;
              font-size: 13px;
              padding: 12px 16px;
              border-radius: 8px;
              margin-bottom: 25px;
              text-align: center;
            }

            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
            .print-btn {
              display: block;
              width: 250px;
              margin: 0 auto 30px auto;
              padding: 14px;
              background: #059669;
              color: white;
              border: none;
              border-radius: 12px;
              font-weight: 600;
              font-size: 14px;
              cursor: pointer;
              text-align: center;
              box-shadow: 0 4px 6px rgba(5, 150, 105, 0.15);
              transition: background-color 0.2s;
            }
            .print-btn:hover {
              background: #047857;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <button class="print-btn no-print" onclick="window.print()">Print This Report</button>
            <div class="header">
              <div class="platform-title">Quiz Space • Learning Analytics</div>
              <h1>Student Quiz Evaluation Report</h1>
            </div>

            ${!hasDetailedAnswers ? `
              <div class="info-banner">
                <strong>Historical Attempt Note:</strong> This attempt was saved before detailed student answer logging was active. 
                Below are the questions and correct answers for this quiz, but the student's individual select options were not logged.
              </div>
            ` : ''}

            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Student Name</span>
                <span class="meta-value">${entry.displayName || 'Anonymous'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Quiz Title</span>
                <span class="meta-value">${entry.quizTitle || 'Quiz'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Category</span>
                <span class="meta-value">${entry.category || 'Uncategorized'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Score / Accuracy</span>
                <span class="meta-value" style="font-weight: 700; color: #059669;">
                  ${entry.score} / ${entry.totalQuestions} (${accuracy}%)
                </span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Time Taken</span>
                <span class="meta-value">${entry.timeTaken} seconds</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Date Completed</span>
                <span class="meta-value">${dateStr}</span>
              </div>
            </div>

            <h2>Comprehensive Assessment Breakdown</h2>
            <div class="questions-list">
              ${renderAnswersList()}
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlStr);
    printWindow.document.close();
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersList = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setUsers(usersList);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const toggleAdminRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'deactivated' ? 'active' : 'deactivated';
    try {
      await updateDoc(doc(db, 'users', userId), { status: newStatus });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUserIds.size === 0) return;
    
    showConfirm({
      title: 'Delete Users',
      message: `Are you sure you want to delete ${selectedUserIds.size} users? This action cannot be undone.`,
      isDanger: true,
      confirmText: 'Delete All',
      onConfirm: async () => {
        const batch = writeBatch(db);
        selectedUserIds.forEach(id => {
          // Don't delete the primary admin
          const user = users.find(u => u.id === id);
          if (user?.email !== 'shaibu5278@gmail.com') {
            batch.delete(doc(db, 'users', id));
          }
        });

        try {
          await batch.commit();
          setUsers(prev => prev.filter(u => !selectedUserIds.has(u.id)));
          setSelectedUserIds(new Set());
          showToast('Users deleted successfully.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'users/bulk');
        }
      }
    });
  };

  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.id?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || (u.role || 'user') === roleFilter;
    const matchesStatus = statusFilter === 'all' || (u.status || 'active') === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleEdit = (quiz: Quiz) => {
    setEditingQuizId(quiz.id);
    setNewQuiz({
      title: quiz.title,
      description: quiz.description,
      timeLimit: quiz.timeLimit,
      category: quiz.category || 'General',
      accessCode: quiz.accessCode || '',
      questions: JSON.parse(JSON.stringify(quiz.questions)) // Deep copy
    });
    setIsCreating(true);
  };

  const handleBack = () => {
    setIsCreating(false);
    setEditingQuizId(null);
    setNewQuiz({ title: '', description: '', timeLimit: 600, questions: [], category: 'General', accessCode: '' });
  };

  const handleAddQuestion = () => {
    setNewQuiz(prev => ({
      ...prev,
      questions: [
        ...(prev.questions || []),
        { id: Math.random().toString(36).substr(2, 9), text: '', options: ['', '', '', ''], correctAnswer: 0, explanation: '' }
      ]
    }));
  };

  const handleQuestionChange = (index: number, field: string, value: any) => {
    const updatedQuestions = [...(newQuiz.questions || [])];
    if (field === 'text') updatedQuestions[index].text = value;
    if (field === 'explanation') updatedQuestions[index].explanation = value;
    if (field === 'correctAnswer') updatedQuestions[index].correctAnswer = parseInt(value);
    if (field === 'type') updatedQuestions[index].type = value as 'multiple_choice' | 'fill_in_the_blank';
    if (field === 'correctAnswerText') updatedQuestions[index].correctAnswerText = value;
    setNewQuiz(prev => ({ ...prev, questions: updatedQuestions }));
  };

  const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
    const updatedQuestions = [...(newQuiz.questions || [])];
    updatedQuestions[qIndex].options[oIndex] = value;
    setNewQuiz(prev => ({ ...prev, questions: updatedQuestions }));
  };

  const handleRemoveQuestion = (index: number) => {
    const updatedQuestions = [...(newQuiz.questions || [])];
    updatedQuestions.splice(index, 1);
    setNewQuiz(prev => ({ ...prev, questions: updatedQuestions }));
  };

  const parseCSV = () => {
    try {
      const lines = csvText.trim().split('\n');
      const parsedQuestions = lines.map(line => {
        const [text, o1, o2, o3, o4, correct, explanation] = line.split(',').map(s => s.trim());
        if (!text || !o1 || !o2 || !o3 || !o4 || correct === undefined) {
          throw new Error('Invalid CSV format. Use: Question,Option1,Option2,Option3,Option4,CorrectIndex(0-3),Explanation(optional)');
        }
        return {
          id: Math.random().toString(36).substr(2, 9),
          text,
          options: [o1, o2, o3, o4],
          correctAnswer: parseInt(correct),
          explanation: explanation || ''
        };
      });
      setNewQuiz(prev => ({ ...prev, questions: [...(prev.questions || []), ...parsedQuestions] }));
      setCsvText('');
      showToast('CSV parsed successfully!', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleSubmit = async () => {
    if (!newQuiz.title || !newQuiz.description || !newQuiz.questions?.length) {
      showToast('Please fill all fields and add at least one question.', 'error');
      return;
    }

    const selectedCategoryObj = categories.find(cat => cat.name === (newQuiz.category || 'General'));
    const categoryRequiresAccessCode = selectedCategoryObj?.requiresAccessCode === true;
    if (categoryRequiresAccessCode && !newQuiz.accessCode?.trim()) {
      showToast('Please set an access code for this passcode-protected category.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingQuizId) {
        // Find the document ID in Firestore
        // Note: quiz.id in the state is the custom ID, but we need the Firestore doc ID
        // Actually, in this app, it seems customQuizzes are fetched and doc.id is assigned to quiz.id
        await updateDoc(doc(db, 'quizzes', editingQuizId), {
          ...newQuiz,
          updatedAt: serverTimestamp()
        });
        showToast('Quiz updated successfully!', 'success');
      } else {
        const quizData = {
          ...newQuiz,
          id: Math.random().toString(36).substr(2, 9),
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid,
          session: 'all'
        };
        await addDoc(collection(db, 'quizzes'), quizData);
        showToast('Quiz created successfully!', 'success');
      }
      handleBack();
    } catch (error) {
      handleFirestoreError(error, editingQuizId ? OperationType.UPDATE : OperationType.CREATE, 'quizzes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    showConfirm({
      title: 'Delete Quiz',
      message: 'Are you sure you want to delete this quiz?',
      isDanger: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'quizzes', id));
          showToast('Quiz deleted successfully.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'quizzes');
        }
      }
    });
  };

  const toggleQuizStatus = async (quizId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'quizzes', quizId), {
        isActive: !currentStatus,
        updatedAt: serverTimestamp()
      });
      showToast(`Quiz ${!currentStatus ? 'activated' : 'deactivated'} successfully!`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quizzes/${quizId}`);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocked. Please allow popups to print.', 'error');
      return;
    }

    const quizTitle = exportQuizId === 'all' ? 'All Quizzes' : customQuizzes.find(q => q.id === exportQuizId)?.title || 'Quiz';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Leaderboard - ${quizTitle}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #1a1a1a; line-height: 1.5; }
            .container { max-width: 800px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 10px; font-size: 24px; }
            .subtitle { text-align: center; color: #666; margin-bottom: 30px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #eee; padding: 12px 8px; text-align: left; }
            th { background-color: #f8f9fa; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; color: #888; }
            .rank { width: 40px; text-align: center; font-family: monospace; color: #999; }
            .score { text-align: right; font-weight: 700; color: #059669; }
            .time { color: #666; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
            .print-btn {
              display: block;
              width: 200px;
              margin: 20px auto;
              padding: 12px;
              background: #059669;
              color: white;
              border: none;
              border-radius: 8px;
              font-weight: 600;
              cursor: pointer;
              text-align: center;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <button class="print-btn no-print" onclick="window.print()">Print Leaderboard</button>
            <h1>Leaderboard: ${quizTitle}</h1>
            <p class="subtitle">Top ${exportData.length} Students • Generated on ${new Date().toLocaleDateString()}</p>
            <table>
              <thead>
                <tr>
                  <th class="rank">Rank</th>
                  <th>Student Name</th>
                  <th class="score">Score</th>
                  <th>Time Taken</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${exportData.map((entry, index) => `
                  <tr>
                    <td class="rank">#${index + 1}</td>
                    <td>${entry.displayName || 'Anonymous'}</td>
                    <td class="score">${entry.score} pts</td>
                    <td class="time">${entry.timeTaken}s</td>
                    <td>${entry.createdAt?.seconds ? new Date(entry.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <script>
            // Auto-trigger print after a short delay to ensure rendering
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const fetchExportData = async () => {
    setIsFetchingExport(true);
    try {
      let q;
      if (exportQuizId === 'all') {
        q = query(
          collection(db, 'scores'),
          orderBy('score', 'desc'),
          orderBy('createdAt', 'asc'),
          orderBy('timeTaken', 'asc'),
          limit(exportLimit)
        );
      } else {
        q = query(
          collection(db, 'scores'),
          where('quizId', '==', exportQuizId),
          orderBy('score', 'desc'),
          orderBy('createdAt', 'asc'),
          orderBy('timeTaken', 'asc'),
          limit(exportLimit)
        );
      }
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setExportData(data);
      if (data.length === 0) {
        showToast('No scores found for the selected criteria.', 'info');
      }
    } catch (error) {
      console.error("Error fetching export data:", error);
      showToast('Failed to fetch leaderboard data.', 'error');
    } finally {
      setIsFetchingExport(false);
    }
  };

  const handleClearLeaderboard = async () => {
    showConfirm({
      title: 'Clear Leaderboard',
      message: `Are you sure you want to clear ${clearCategory === 'all' ? 'all' : `the ${clearCategory}`} leaderboard entries? This action cannot be undone.`,
      isDanger: true,
      confirmText: 'Clear Now',
      onConfirm: async () => {
        setIsClearing(true);
        try {
          let q;
          if (clearCategory === 'all') {
            q = query(collection(db, 'scores'));
          } else {
            q = query(collection(db, 'scores'), where('category', '==', clearCategory));
          }
          
          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            showToast('No entries found to clear.', 'info');
            return;
          }

          const chunks = [];
          for (let i = 0; i < snapshot.docs.length; i += 500) {
            chunks.push(snapshot.docs.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach((doc) => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }
          
          showToast(`Leaderboard ${clearCategory === 'all' ? 'all' : clearCategory} cleared successfully.`, 'success');
          setExportData([]);
        } catch (error) {
          console.error("Error clearing leaderboard:", error);
          showToast('Failed to clear leaderboard.', 'error');
        } finally {
          setIsClearing(false);
        }
      }
    });
  };

  const handleUpdateSettings = async (key: string, value: boolean) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        ...globalSettings,
        [key]: value,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('Settings updated successfully!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/global');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsAddingCategory(true);
    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        requiresAccessCode: newCategoryRequiresAccessCode,
        createdAt: serverTimestamp()
      });
      setNewCategoryName('');
      setNewCategoryRequiresAccessCode(false);
      showToast('Category added successfully!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editCategoryName.trim()) return;
    try {
      await updateDoc(doc(db, 'categories', id), {
        name: editCategoryName.trim(),
        requiresAccessCode: editCategoryRequiresAccessCode,
        updatedAt: serverTimestamp()
      });
      setEditingCategoryId(null);
      showToast('Category updated successfully!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    showConfirm({
      title: 'Delete Category',
      message: 'Are you sure you want to delete this category? Quizzes in this category will no longer be filtered by it.',
      isDanger: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'categories', id));
          showToast('Category deleted successfully.', 'success');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
        }
      }
    });
  };

  const selectedCategoryObj = categories.find(cat => cat.name === (newQuiz.category || 'General'));
  const categoryRequiresAccessCode = selectedCategoryObj?.requiresAccessCode === true;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-3 sm:space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide -mx-6 px-6 sm:mx-0 sm:px-0">
            <button 
              onClick={() => { setActiveTab('quizzes'); setIsCreating(false); }}
              className={`text-xs sm:text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'quizzes' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-black/40 hover:text-black/60'}`}
            >
              <FileText className="w-3 h-3 sm:w-4 h-4" />
              Quizzes
            </button>
            <button 
              onClick={() => { setActiveTab('users'); setIsCreating(false); }}
              className={`text-xs sm:text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'users' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-black/40 hover:text-black/60'}`}
            >
              <Users className="w-3 h-3 sm:w-4 h-4" />
              User Management
            </button>
            <button 
              onClick={() => { setActiveTab('leaderboard'); setIsCreating(false); }}
              className={`text-xs sm:text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'leaderboard' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-black/40 hover:text-black/60'}`}
            >
              <Trophy className="w-3 h-3 sm:w-4 h-4" />
              Leaderboard Export
            </button>
            <button 
              onClick={() => { setActiveTab('categories'); setIsCreating(false); }}
              className={`text-xs sm:text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'categories' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-black/40 hover:text-black/60'}`}
            >
              <Layout className="w-3 h-3 sm:w-4 h-4" />
              Categories
            </button>
            <button 
              onClick={() => { setActiveTab('settings'); setIsCreating(false); }}
              className={`text-xs sm:text-sm font-semibold pb-1 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'settings' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-black/40 hover:text-black/60'}`}
            >
              <Settings className="w-3 h-3 sm:w-4 h-4" />
              App Settings
            </button>
          </div>
        </div>
        {activeTab === 'quizzes' && (
          <button 
            onClick={isCreating ? handleBack : () => setIsCreating(true)}
            className="bg-black text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-black/80 transition-all w-full sm:w-auto"
          >
            {isCreating ? <ArrowLeft className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isCreating ? 'Back to List' : 'Create New Quiz'}
          </button>
        )}
      </div>

      {activeTab === 'quizzes' && (
        isCreating ? (
          <div className="bg-white p-8 rounded-3xl border border-black/5 space-y-8 shadow-sm">
            {/* ... quiz creation form ... */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-black/20 uppercase tracking-widest">Quiz Title</label>
                <input 
                  type="text" 
                  value={newQuiz.title}
                  onChange={e => setNewQuiz(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. General Knowledge Quiz"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-black/20 uppercase tracking-widest">Category</label>
                <select 
                  value={newQuiz.category}
                  onChange={e => setNewQuiz(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {categories.map((cat, idx) => (
                    <option key={`${cat.id}-${idx}`} value={cat.name}>{cat.name}</option>
                  ))}
                  {categories.length === 0 && <option value="General">General</option>}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-black/20 uppercase tracking-widest">Time Limit (seconds)</label>
                <input 
                  type="number" 
                  value={newQuiz.timeLimit}
                  onChange={e => setNewQuiz(prev => ({ ...prev, timeLimit: parseInt(e.target.value) }))}
                  className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              {categoryRequiresAccessCode && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Quiz Access Code (Required for Users)
                  </label>
                  <input 
                    type="text" 
                    value={newQuiz.accessCode || ''}
                    onChange={e => setNewQuiz(prev => ({ ...prev, accessCode: e.target.value }))}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-500 outline-none text-amber-950 font-medium font-sans placeholder-amber-700/40"
                    placeholder="e.g. MATH2026"
                    required
                  />
                  <p className="text-[10px] text-amber-600 font-sans italic">
                    This category requires an access code. Users must enter this code to enter.
                  </p>
                </div>
              )}
              <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-black/20 uppercase tracking-widest">Description</label>
                <textarea 
                  value={newQuiz.description}
                  onChange={e => setNewQuiz(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-black/5 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none"
                  placeholder="Briefly describe the quiz content..."
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-black/5 pb-4">
                <h3 className="text-xl font-semibold">Questions ({newQuiz.questions?.length || 0})</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={handleAddQuestion}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add Manually
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 space-y-4">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                  <Upload className="w-4 h-4" /> Import from CSV
                </div>
                <p className="text-xs text-amber-700/70">Format: Question, Option 1, Option 2, Option 3, Option 4, CorrectIndex(0-3)</p>
                <textarea 
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                  placeholder="What is 2+2?, 3, 4, 5, 6, 1"
                  className="w-full bg-white border-amber-200 rounded-xl px-4 py-3 text-sm font-mono h-32 focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <button 
                  onClick={parseCSV}
                  className="bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Parse & Add CSV Questions
                </button>
              </div>

              <div className="space-y-6">
                {newQuiz.questions?.map((q, idx) => {
                  const qType = q.type || 'multiple_choice';

                  return (
                    <div key={idx} className="p-6 bg-black/5 rounded-2xl space-y-4 relative group">
                      <button 
                        onClick={() => handleRemoveQuestion(idx)}
                        className="absolute top-4 right-4 text-black/20 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest block font-sans">Question {idx + 1}</label>
                          <input 
                            type="text" 
                            value={q.text}
                            onChange={e => handleQuestionChange(idx, 'text', e.target.value)}
                            className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-sans"
                            placeholder="Enter the question text..."
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest block font-sans">Question Type</label>
                          <select 
                            value={qType}
                            onChange={e => handleQuestionChange(idx, 'type', e.target.value)}
                            className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-sans"
                          >
                            <option value="multiple_choice">Multiple Choice</option>
                            <option value="fill_in_the_blank">Fill in the Blank</option>
                          </select>
                        </div>
                      </div>

                      {qType === 'fill_in_the_blank' ? (
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest block font-sans">Correct Answer Text(s)</label>
                          <input 
                            type="text" 
                            value={q.correctAnswerText || ''}
                            onChange={e => handleQuestionChange(idx, 'correctAnswerText', e.target.value)}
                            className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-sans"
                            placeholder="e.g. Earth (or use commas for alternatives like: Earth, The Earth)"
                          />
                          <p className="text-[10px] text-black/40 italic font-sans">
                            Students will be graded correctly if their input matches any of the comma-separated options (case-insensitive).
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} className="space-y-1">
                                <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest block font-sans">Option {oIdx + 1}</label>
                                <input 
                                  type="text" 
                                  value={opt}
                                  onChange={e => handleOptionChange(idx, oIdx, e.target.value)}
                                  className="w-full bg-white border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-sans"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest block font-sans">Correct Answer Index (0-3)</label>
                            <select 
                              value={q.correctAnswer}
                              onChange={e => handleQuestionChange(idx, 'correctAnswer', e.target.value)}
                              className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-sans"
                            >
                              {q.options.map((_, oIdx) => (
                                <option key={oIdx} value={oIdx}>Option {oIdx + 1}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest block font-sans">Explanation (Optional)</label>
                        <input 
                          type="text" 
                          value={q.explanation}
                          onChange={e => handleQuestionChange(idx, 'explanation', e.target.value)}
                          className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          placeholder="Why is this the correct answer?"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (editingQuizId ? 'Updating Quiz...' : 'Creating Quiz...') : (editingQuizId ? 'Update Quiz' : 'Save & Publish Quiz')}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {customQuizzes.map(quiz => (
              <div key={quiz.id} className="bg-white p-6 rounded-3xl border border-black/5 flex items-center justify-between group hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => toggleQuizStatus(quiz.id, quiz.isActive !== false)}
                    className={`w-12 h-7 rounded-full p-1 transition-all ${quiz.isActive !== false ? 'bg-emerald-600' : 'bg-black/10'}`}
                    title={quiz.isActive !== false ? 'Deactivate Quiz' : 'Activate Quiz'}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-all transform ${quiz.isActive !== false ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-lg">{quiz.title}</h4>
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${quiz.isActive !== false ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                        {quiz.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-black/40">{quiz.questions.length} Questions • {quiz.timeLimit / 60} mins</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEdit(quiz)}
                    className="p-3 text-black/20 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                    title="Edit Quiz"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleDelete(quiz.id)}
                    className="p-3 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Delete Quiz"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
            {customQuizzes.length === 0 && (
              <div className="md:col-span-2 text-center py-20 bg-white rounded-3xl border border-dashed border-black/10">
                <FileText className="w-12 h-12 text-black/10 mx-auto mb-4" />
                <p className="text-black/30">No custom quizzes created yet.</p>
              </div>
            )}
          </div>
        )
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-black/5 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-6 border-b border-black/5 bg-black/[0.02] space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                Registered Users ({filteredUsers.length})
              </h3>
              <div className="flex items-center justify-between sm:justify-end gap-2">
                {selectedUserIds.size > 0 && (
                  <button 
                    onClick={handleBulkDelete}
                    className="bg-red-50 text-red-600 px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-xs font-bold flex items-center gap-2 hover:bg-red-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3 sm:w-4 h-4" />
                    Delete ({selectedUserIds.size})
                  </button>
                )}
                <button 
                  onClick={fetchUsers}
                  className="p-2 text-black/40 hover:text-emerald-600 transition-all"
                  title="Refresh Users"
                >
                  <RefreshCcw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/20" />
                <input 
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-black/5 border-none rounded-xl sm:rounded-2xl pl-12 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-black/20 shrink-0" />
                <select 
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value as any)}
                  className="flex-1 bg-black/5 border-none rounded-xl sm:rounded-2xl px-4 py-2.5 sm:py-3 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admins</option>
                  <option value="user">Students</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-black/20 shrink-0" />
                <select 
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="flex-1 bg-black/5 border-none rounded-xl sm:rounded-2xl px-4 py-2.5 sm:py-3 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/[0.01]">
                  <th className="px-6 py-4 w-12">
                    <input 
                      type="checkbox" 
                      checked={selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-black/10 text-emerald-600 focus:ring-emerald-500"
                    />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-black/20 uppercase tracking-widest">User</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-black/20 uppercase tracking-widest">Role</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-black/20 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-black/20 uppercase tracking-widest">Joined</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-black/20 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className={`hover:bg-black/[0.01] transition-colors ${u.status === 'deactivated' ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => handleSelectUser(u.id)}
                        disabled={u.email === 'shaibu5278@gmail.com'}
                        className="w-4 h-4 rounded border-black/10 text-emerald-600 focus:ring-emerald-500 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center overflow-hidden border border-black/5">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <UserIcon className="w-5 h-5 text-emerald-600" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{u.displayName}</span>
                          <div className="flex flex-col gap-0.5">
                            {u.email && (
                              <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                                <Mail className="w-2.5 h-2.5" />
                                {u.email}
                              </span>
                            )}
                            {u.phoneNumber && (
                              <span className="text-[10px] text-black/40 flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5" />
                                {u.phoneNumber}
                              </span>
                            )}
                            <span className="text-[10px] text-black/20 font-mono">{u.id}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        u.role === 'admin' ? 'bg-emerald-100 text-emerald-700' : 'bg-black/5 text-black/40'
                      }`}>
                        {u.role || 'user'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        u.status === 'deactivated' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {u.status || 'active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-black/40">
                      {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => toggleAdminRole(u.id, u.role || 'user')}
                          disabled={u.email === 'shaibu5278@gmail.com'}
                          className={`p-2 rounded-xl transition-all ${
                            u.role === 'admin' 
                              ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' 
                              : 'text-black/20 hover:text-emerald-600 hover:bg-emerald-50'
                          } disabled:opacity-30`}
                          title={u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                        >
                          {u.role === 'admin' ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={() => toggleUserStatus(u.id, u.status || 'active')}
                          disabled={u.email === 'shaibu5278@gmail.com'}
                          className={`p-2 rounded-xl transition-all ${
                            u.status === 'deactivated' 
                              ? 'text-red-600 bg-red-50 hover:bg-red-100' 
                              : 'text-black/20 hover:text-red-600 hover:bg-red-50'
                          } disabled:opacity-30`}
                          title={u.status === 'deactivated' ? 'Activate Account' : 'Deactivate Account'}
                        >
                          {u.status === 'deactivated' ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={() => {
                            showConfirm({
                              title: 'Delete User',
                              message: 'Are you sure you want to delete this user?',
                              isDanger: true,
                              confirmText: 'Delete',
                              onConfirm: async () => {
                                try {
                                  await deleteDoc(doc(db, 'users', u.id));
                                  setUsers(prev => prev.filter(user => user.id !== u.id));
                                  showToast('User deleted successfully.', 'success');
                                } catch (err) {
                                  handleFirestoreError(err, OperationType.DELETE, `users/${u.id}`);
                                }
                              }
                            });
                          }}
                          disabled={u.email === 'shaibu5278@gmail.com'}
                          className="p-2 text-black/20 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-30"
                          title="Delete User"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && !isLoadingUsers && (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-black/30 italic">
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-black/5 space-y-6 sm:space-y-8 shadow-sm">
          
          {/* Bulk Clear Section */}
          <div className="bg-red-50/50 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-red-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-red-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Bulk Clear Leaderboard
                </h4>
                <p className="text-[10px] sm:text-xs text-red-700/60">Permanently delete score records from the database.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-bold text-red-900/40 uppercase tracking-widest">Clear by Category</label>
                <select 
                  value={clearCategory}
                  onChange={e => setClearCategory(e.target.value)}
                  className="w-full bg-white border border-red-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="all">All Categories (Complete Wipe)</option>
                  {categories.map((cat, idx) => (
                    <option key={`${cat.id}-${idx}`} value={cat.name}>{cat.name}</option>
                  ))}
                  <option value="Uncategorized">Uncategorized</option>
                </select>
              </div>
              <button 
                onClick={handleClearLeaderboard}
                disabled={isClearing}
                className="bg-red-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isClearing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Clear Selected
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-stretch sm:items-end">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest">Select Quiz</label>
              <select 
                value={exportQuizId}
                onChange={e => setExportQuizId(e.target.value)}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-2.5 sm:py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="all">All Quizzes</option>
                {customQuizzes.map(q => (
                  <option key={q.id} value={q.id}>{q.title}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-48 space-y-2">
              <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest">Number of Students</label>
              <input 
                type="number" 
                value={exportLimit}
                onChange={e => setExportLimit(parseInt(e.target.value) || 0)}
                className="w-full bg-black/5 border-none rounded-xl px-4 py-2.5 sm:py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                min="1"
                max="1000"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button 
                onClick={fetchExportData}
                disabled={isFetchingExport}
                className="flex-1 sm:flex-none bg-black text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl text-sm font-semibold hover:bg-black/80 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isFetchingExport ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                {isFetchingExport ? 'Fetching...' : 'Fetch Data'}
              </button>
              {exportData.length > 0 && (
                <button 
                  onClick={handlePrint}
                  className="flex-1 sm:flex-none bg-emerald-600 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Print List
                </button>
              )}
            </div>
          </div>

          {exportData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="px-4 py-3 text-[10px] font-bold text-black/20 uppercase tracking-widest">Rank</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-black/20 uppercase tracking-widest">Student</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-black/20 uppercase tracking-widest">Score</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-black/20 uppercase tracking-widest">Time</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-black/20 uppercase tracking-widest">Date</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-black/20 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exportData.map((entry, idx) => (
                    <tr key={`${entry.id}-${idx}`} className="border-b border-black/[0.02] hover:bg-black/[0.01] transition-colors">
                      <td className="px-4 py-4 font-mono text-sm text-black/40">#{idx + 1}</td>
                      <td className="px-4 py-4 font-semibold text-sm">{entry.displayName}</td>
                      <td className="px-4 py-4">
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-xs font-bold">
                          {entry.score} pts
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-black/40">{entry.timeTaken}s</td>
                      <td className="px-4 py-4 text-sm text-black/40">
                        {entry.createdAt?.seconds ? new Date(entry.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedScoreForReview(entry)}
                            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all text-emerald-800"
                            title="Review Answers"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="hidden md:inline">Review</span>
                          </button>
                          <button
                            onClick={() => handlePrintUserDetails(entry)}
                            className="bg-black/5 text-black/60 hover:bg-black/10 p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                            title="Print Details"
                          >
                            <Printer className="w-4 h-4" />
                            <span className="hidden md:inline">Print Details</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-20 bg-black/[0.02] rounded-3xl border border-dashed border-black/10">
              <Medal className="w-12 h-12 text-black/10 mx-auto mb-4" />
              <p className="text-black/30">Select criteria and fetch data to see the leaderboard list.</p>
            </div>
          )}
        </div>
      </div>
    )}

      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-black/5 space-y-6 sm:space-y-8 shadow-sm">
            <div className="space-y-1">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Layout className="w-5 h-5 text-emerald-600" />
                Manage Categories
              </h3>
              <p className="text-sm text-black/40 font-sans">Create and organize quiz categories.</p>
            </div>

            <form onSubmit={handleAddCategory} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <input 
                  type="text" 
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Category name (e.g. Mathematics)"
                  className="flex-1 bg-black/5 border-none rounded-xl px-4 sm:px-6 py-3 sm:py-4 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-sm sm:text-base font-sans"
                />
                <button 
                  type="submit"
                  disabled={isAddingCategory || !newCategoryName.trim()}
                  className="bg-emerald-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm sm:text-base font-sans"
                >
                  {isAddingCategory ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
                  Add Category
                </button>
              </div>
              <div className="flex items-center gap-2 px-1">
                <input 
                  type="checkbox"
                  id="newCategoryRequiresAccessCode"
                  checked={newCategoryRequiresAccessCode}
                  onChange={e => setNewCategoryRequiresAccessCode(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-black/10 transition-all cursor-pointer"
                />
                <label htmlFor="newCategoryRequiresAccessCode" className="text-xs sm:text-sm text-black/60 font-medium select-none font-sans cursor-pointer">
                  Enable quiz access passcodes (Admin sets a password for quizzes under this category)
                </label>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {categories.map((cat, idx) => (
              <div key={`${cat.id}-${idx}`} className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-black/5 flex items-center justify-between group hover:shadow-md transition-all">
                {editingCategoryId === cat.id ? (
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-2">
                      <input 
                        autoFocus
                        type="text" 
                        value={editCategoryName}
                        onChange={e => setEditCategoryName(e.target.value)}
                        className="flex-1 bg-black/5 border-none rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
                      />
                      <button 
                        onClick={() => handleUpdateCategory(cat.id)}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setEditingCategoryId(null)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 px-1">
                      <input 
                        type="checkbox"
                        id={`editCategoryRequiresAccessCode-${cat.id}`}
                        checked={editCategoryRequiresAccessCode}
                        onChange={e => setEditCategoryRequiresAccessCode(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-black/10 transition-all cursor-pointer"
                      />
                      <label htmlFor={`editCategoryRequiresAccessCode-${cat.id}`} className="text-xs text-black/60 font-medium select-none font-sans cursor-pointer">
                        Requires access passcode
                      </label>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <h4 className="font-bold flex flex-wrap items-center gap-2">
                        <span>{cat.name}</span>
                        {cat.requiresAccessCode && (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-sans shrink-0">
                            Passcode Required
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] font-bold text-black/20 uppercase tracking-widest">
                        {customQuizzes.filter(q => q.category === cat.name).length} Quizzes
                      </p>
                    </div>
                    <div className="flex gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setEditingCategoryId(cat.id); setEditCategoryName(cat.name); setEditCategoryRequiresAccessCode(!!cat.requiresAccessCode); }}
                        className="p-2 text-black/20 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-2 text-black/20 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3 text-center py-12 sm:py-20 bg-white rounded-2xl sm:rounded-3xl border border-dashed border-black/10">
                <Plus className="w-10 h-10 sm:w-12 h-12 text-black/10 mx-auto mb-4" />
                <p className="text-black/30 text-sm">No categories created yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-black/5 space-y-6 sm:space-y-8 shadow-sm">
            <div className="space-y-1">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                Global Application Settings
              </h3>
              <p className="text-sm text-black/40 text-balance">Configure global restrictions for all users. These settings take effect immediately.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-black/5 space-y-4 hover:border-emerald-100 transition-all">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold flex items-center gap-2 text-sm sm:text-base">
                      <UserCircle className="w-4 h-4 text-emerald-600" />
                      Account Creation
                    </h4>
                    <p className="text-[10px] sm:text-xs text-black/40">Toggle whether new users can create accounts.</p>
                  </div>
                  <button 
                    onClick={() => handleUpdateSettings('allowAccountCreation', !globalSettings.allowAccountCreation)}
                    className={`w-12 sm:w-14 h-7 sm:h-8 rounded-full p-1 transition-all ${globalSettings.allowAccountCreation ? 'bg-emerald-600' : 'bg-black/10'}`}
                  >
                    <div className={`w-5 sm:w-6 h-5 sm:h-6 bg-white rounded-full shadow-sm transition-all transform ${globalSettings.allowAccountCreation ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest ${globalSettings.allowAccountCreation ? 'text-emerald-600' : 'text-red-500'}`}>
                  Status: {globalSettings.allowAccountCreation ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 p-3 sm:p-4 rounded-xl flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[10px] sm:text-xs text-emerald-800 leading-relaxed">
                <strong>Note:</strong> Disabling account creation will prevent new users from signing up, but existing users will still be able to log in. Individual quiz activation can be managed directly from the <strong>Quizzes</strong> tab.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Review Quiz Answers Modal */}
      {selectedScoreForReview && (() => {
        const entry = selectedScoreForReview;
        let questions = entry.questions || [];
        let userAnswers = entry.userAnswers || [];

        if (questions.length === 0) {
          const originalQuiz = customQuizzes.find(q => q.id === entry.quizId);
          if (originalQuiz) {
            questions = originalQuiz.questions || [];
          }
        }

        const accuracy = entry.accuracy ?? Math.round((entry.score / (questions.length || 1)) * 100);
        const dateStr = entry.createdAt?.seconds ? new Date(entry.createdAt.seconds * 1000).toLocaleString() : 'N/A';
        const hasDetailedAnswers = userAnswers.length > 0;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-3xl rounded-[32px] border border-black/5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              
              {/* Header */}
              <div className="p-6 border-b border-black/5 flex items-center justify-between bg-[#fafafa]">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block font-sans">Admin Analytics</span>
                  <h3 className="text-xl font-bold font-sans">Quiz Report & Review</h3>
                </div>
                <button 
                  onClick={() => setSelectedScoreForReview(null)}
                  className="p-2 text-black/40 hover:text-black/60 hover:bg-black/5 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-8 overflow-y-auto space-y-8 flex-1">
                
                {/* Metadata Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-[#fcfcfc] border border-black/5 p-6 rounded-2xl">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-black/20 uppercase tracking-widest block font-sans">Student</span>
                    <span className="text-sm font-semibold text-black/80 font-sans">{entry.displayName || 'Anonymous'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-black/20 uppercase tracking-widest block font-sans">Quiz</span>
                    <span className="text-sm font-semibold text-black/80 font-sans">{entry.quizTitle || 'Quiz'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-black/20 uppercase tracking-widest block font-sans">Category</span>
                    <span className="text-sm font-semibold text-black/80 font-sans">{entry.category || 'Uncategorized'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-black/20 uppercase tracking-widest block font-sans">Score</span>
                    <span className="text-sm font-bold text-emerald-600 font-sans">{entry.score} / {entry.totalQuestions} ({accuracy}%)</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-black/20 uppercase tracking-widest block font-sans">Time Taken</span>
                    <span className="text-sm font-semibold text-black/80 font-sans">{entry.timeTaken} seconds</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-black/20 uppercase tracking-widest block font-sans">Date</span>
                    <span className="text-sm font-semibold text-black/80 font-sans">{dateStr}</span>
                  </div>
                </div>

                {!hasDetailedAnswers && (
                  <div className="bg-amber-50/50 text-amber-800 border border-amber-100 p-4 rounded-xl text-xs leading-relaxed flex gap-3">
                    <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Historical Attempt:</strong> This score was saved before detailed student answer logging was active. The correct answers for this quiz are visible below, but the student's individual selection breakdown is not recorded.
                    </div>
                  </div>
                )}

                {/* Questions list */}
                <div className="space-y-6">
                  <h4 className="font-bold text-base flex items-center gap-2 font-sans font-sans">Assessment evaluation</h4>
                  {questions.length === 0 ? (
                    <p className="text-sm text-red-500 font-medium font-sans">No question information available for this quiz. It might have been deleted.</p>
                  ) : (
                    questions.map((q: any, qIdx: number) => {
                      const uAns = userAnswers[qIdx];
                      const hasUserAnswer = uAns !== undefined && uAns !== null;
                      
                      let isUserCorrect = false;
                      if (q.type === 'fill_in_the_blank') {
                        const correctAnsText = q.correctAnswerText || '';
                        const userAnsText = String(uAns || '').trim().toLowerCase();
                        const possibleAnswers = correctAnsText.split(',').map(a => a.trim().toLowerCase());
                        isUserCorrect = possibleAnswers.includes(userAnsText);
                      } else {
                        isUserCorrect = hasUserAnswer && uAns === q.correctAnswer;
                      }

                      if (q.type === 'fill_in_the_blank') {
                        return (
                          <div key={qIdx} className="border border-black/5 p-5 rounded-2xl bg-[#fafafa] space-y-3">
                            <p className="font-medium text-sm text-black/80 leading-snug font-sans">
                              <span className="text-black/30 font-mono text-xs mr-2">{String(qIdx+1).padStart(2, '0')}.</span>
                              {q.text} <span className="bg-emerald-50 text-[10px] text-emerald-700 font-bold px-2 py-0.5 rounded-md ml-1 font-sans uppercase tracking-wider">Fill-in</span>
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-6">
                              <div className={`px-3 py-2.5 rounded-xl text-xs border font-sans flex flex-col justify-center ${
                                hasUserAnswer
                                  ? isUserCorrect
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100 font-medium'
                                    : 'bg-red-50 text-red-800 border-red-100 font-medium'
                                  : 'bg-white border-black/5 text-black/60'
                              }`}>
                                <span className="font-semibold block text-[10px] uppercase tracking-wider text-black/40 mb-1">Student's Answer</span>
                                <span className="text-sm font-medium">{hasUserAnswer ? `"${uAns}"` : 'No Answer'}</span>
                              </div>
                              <div className="px-3 py-2.5 rounded-xl text-xs bg-emerald-50 text-emerald-800 border-emerald-100 border font-sans flex flex-col justify-center">
                                <span className="font-semibold block text-[10px] uppercase tracking-wider text-emerald-600/70 mb-1">Correct Answer(s)</span>
                                <span className="text-sm font-semibold">{q.correctAnswerText || 'N/A'}</span>
                              </div>
                            </div>
                            {q.explanation && (
                              <div className="pl-6 pt-2 border-t border-black/[0.03] text-[11px] text-black/40 italic font-sans">
                                <strong>Explanation:</strong> {q.explanation}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={qIdx} className="border border-black/5 p-5 rounded-2xl bg-[#fafafa] space-y-3">
                          <p className="font-medium text-sm text-black/80 leading-snug font-sans">
                            <span className="text-black/30 font-mono text-xs mr-2">{String(qIdx+1).padStart(2, '0')}.</span>
                            {q.text}
                          </p>
                          <div className="grid grid-cols-1 gap-2 pl-6">
                            {q.options.map((opt: string, oIdx: number) => {
                              const isCorrect = oIdx === q.correctAnswer;
                              const isChosen = hasUserAnswer && oIdx === uAns;

                              return (
                                <div 
                                  key={oIdx} 
                                  className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between border font-sans ${
                                    isCorrect 
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100 font-medium'
                                      : isChosen
                                        ? 'bg-red-50 text-red-800 border-red-100'
                                        : 'bg-white border-black/5 text-black/60'
                                  }`}
                                >
                                  <span>{opt}</span>
                                  <div className="flex gap-1.5 items-center">
                                    {isCorrect && (
                                      <span className="bg-emerald-100 text-[9px] text-emerald-600 font-bold uppercase py-0.5 px-1.5 rounded-md font-sans">
                                        Correct Option
                                      </span>
                                    )}
                                    {isChosen && (
                                      <span className={`text-[9px] font-bold uppercase py-0.5 px-1.5 rounded-md font-sans ${
                                        isUserCorrect 
                                          ? 'bg-emerald-600 text-white' 
                                          : 'bg-red-200 text-red-700'
                                      }`}>
                                        Student Choice
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {q.explanation && (
                            <div className="pl-6 pt-2 border-t border-black/[0.03] text-[11px] text-black/40 italic font-sans">
                              <strong>Explanation:</strong> {q.explanation}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-black/5 flex justify-end gap-3 bg-[#fafafa]">
                <button 
                  type="button"
                  onClick={() => setSelectedScoreForReview(null)}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-black/5 transition-all text-black/65 font-sans"
                >
                  Close Window
                </button>
                <button 
                  type="button"
                  onClick={() => handlePrintUserDetails(entry)}
                  className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-sm font-sans"
                >
                  <Printer className="w-4 h-4" />
                  Print Report
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

// --- Main App ---

function QuizApp() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<(number | string | null)[]>([]);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const SHARED_URL = 'https://ais-pre-footep2rubz2kaj4v2bbw2-543565851610.europe-west2.run.app';

  const handleShare = () => {
    navigator.clipboard.writeText(SHARED_URL);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2000);
  };
  const [timeTaken, setTimeTaken] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [view, setView] = useState<'home' | 'leaderboard' | 'admin'>('home');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [customQuizzes, setCustomQuizzes] = useState<Quiz[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showNameModal, setShowNameModal] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({
    allowAccountCreation: true,
    allowQuizAccess: true
  });
  const [tempName, setTempName] = useState('');
  const [isSubmittingName, setIsSubmittingName] = useState(false);

  // Quiz Access Code prompting states
  const [promptAccessCodeQuiz, setPromptAccessCodeQuiz] = useState<Quiz | null>(null);
  const [userEnteredCode, setUserEnteredCode] = useState('');
  const [accessCodeErrorMsg, setAccessCodeErrorMsg] = useState('');

  // Online/Offline and Firestore availability tracking
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isFirestoreReachable, setIsFirestoreReachable] = useState(true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsFirestoreReachable(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleFirestoreStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.online === false) {
        setIsFirestoreReachable(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('firestore-connection-status', handleFirestoreStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('firestore-connection-status', handleFirestoreStatus);
    };
  }, []);

  const [confirmState, setConfirmState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [toast, setToast] = useState<ToastState | null>(null);

  const showConfirm = (options: Omit<ConfirmState, 'isOpen'>) => {
    setConfirmState({ ...options, isOpen: true });
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };

  const isAdmin = user?.email === 'shaibu5278@gmail.com' || userProfile?.role === 'admin' || (userProfile?.email && userProfile.email === 'shaibu5278@gmail.com');

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'quizzes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedQuizzes = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Quiz[];
      setCustomQuizzes(fetchedQuizzes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'quizzes');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCategories = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Category[];
      setCategories(fetchedCategories);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setGlobalSettings(snapshot.data() as any);
      }
    }, (error) => {
      console.warn("Settings fetch error:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentQuiz && !isAdmin) {
      const updatedQuiz = customQuizzes.find(q => q.id === currentQuiz.id);
      if (updatedQuiz && updatedQuiz.isActive === false) {
        resetQuiz();
        showToast('This quiz has been deactivated by the administrator.', 'info');
      }
    }
  }, [customQuizzes, currentQuiz, isAdmin]);

  const allQuizzes = (selectedCategory === 'All' 
    ? customQuizzes 
    : customQuizzes.filter(q => q.category === selectedCategory)
  ).filter(q => isAdmin || q.isActive !== false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setUserProfile(userSnap.data());
          }
        } catch (error: any) {
          // Only report if it's not a connectivity issue
          if (!error?.message?.includes('client is offline')) {
            handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          }
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (currentQuiz && !showResult && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleFinishQuiz(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [currentQuiz, showResult, timeLeft]);

  const handleJoin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const name = tempName.trim();
    if (!name) return;

    setIsSubmittingName(true);
    try {
      // Create a deterministic email and password from the name
      const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const email = `${sanitizedName}@quiz.internal`;
      const password = `pass_${sanitizedName}`;

      let userCredential;
      try {
        // Try to sign in first
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInError: any) {
        // If user doesn't exist, create account
        if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/invalid-credential' || signInError.code === 'auth/invalid-email') {
          if (!globalSettings.allowAccountCreation) {
            showToast('Account creation is currently disabled by the administrator.', 'error');
            setIsSubmittingName(false);
            return;
          }
          try {
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
          } catch (createError: any) {
            // If creation fails because user already exists (race condition or different error), try sign in one last time
            if (createError.code === 'auth/email-already-in-use') {
              userCredential = await signInWithEmailAndPassword(auth, email, password);
            } else {
              throw createError;
            }
          }
        } else {
          throw signInError;
        }
      }

      const result = userCredential;
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        const profile = {
          uid: result.user.uid,
          displayName: name,
          createdAt: serverTimestamp()
        };
        await setDoc(userRef, profile);
        setUserProfile(profile);
      } else {
        const existingData = userSnap.data();
        await updateDoc(userRef, { displayName: name });
        setUserProfile({ ...existingData, displayName: name });
      }
      setShowNameModal(false);
      showToast(`Welcome, ${name}!`, 'success');
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/operation-not-allowed') {
        // Fallback to anonymous login if email/password is disabled
        try {
          const result = await signInAnonymously(auth);
          const userRef = doc(db, 'users', result.user.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            const profile = {
              uid: result.user.uid,
              displayName: name,
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, profile);
            setUserProfile(profile);
          } else {
            const existingData = userSnap.data();
            await updateDoc(userRef, { displayName: name });
            setUserProfile({ ...existingData, displayName: name });
          }
          setShowNameModal(false);
          showToast(`Welcome, ${name}! (Guest Mode)`, 'info');
        } catch (anonError: any) {
          if (anonError.code === 'auth/operation-not-allowed') {
            showToast('Firebase Auth is not configured. Please enable "Email/Password" or "Anonymous" in the Firebase Console.', 'error');
            // Show a more detailed alert since this is a configuration issue
            alert('Configuration Required: To use name-based login, you must enable "Email/Password" or "Anonymous" authentication in your Firebase Console (Authentication > Sign-in method).');
          } else {
            showToast('Authentication failed. Please try again later.', 'error');
          }
        }
      } else {
        showToast('Authentication failed. Please try a different name.', 'error');
      }
    } finally {
      setIsSubmittingName(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        if (!globalSettings.allowAccountCreation) {
          await signOut(auth);
          showToast('Account creation is currently disabled by the administrator.', 'error');
          return;
        }
        const profile = {
          uid: result.user.uid,
          displayName: result.user.displayName || 'Anonymous',
          photoURL: result.user.photoURL || '',
          createdAt: serverTimestamp()
        };
        await setDoc(userRef, profile);
        setUserProfile(profile);
      } else {
        const existingData = userSnap.data();
        const updatedProfile = {
          displayName: result.user.displayName || existingData.displayName || 'Anonymous',
          photoURL: result.user.photoURL || existingData.photoURL || ''
        };
        await updateDoc(userRef, updatedProfile);
        setUserProfile({ ...existingData, ...updatedProfile });
      }
      setShowNameModal(false);
    } catch (error) {
      console.error("Google login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      resetQuiz();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleVerifyAccessCode = () => {
    if (!promptAccessCodeQuiz) return;
    
    const correctCode = promptAccessCodeQuiz.accessCode?.trim().toLowerCase();
    const inputCode = userEnteredCode.trim().toLowerCase();
    
    if (correctCode === inputCode) {
      const quiz = promptAccessCodeQuiz;
      setPromptAccessCodeQuiz(null);
      
      setCurrentQuiz(quiz);
      setCurrentQuestionIndex(0);
      setSelectedOption(null);
      setScore(0);
      setShowResult(false);
      setAnswers(new Array(quiz.questions.length).fill(null));
      setTimeLeft(quiz.timeLimit);
      setIsTimeUp(false);
      setView('home');
      showToast('Correct access code! Enjoy the quiz.', 'success');
    } else {
      setAccessCodeErrorMsg('Incorrect access code. Please try again.');
    }
  };

  const handleStartQuiz = (quiz: Quiz) => {
    if (quiz.isActive === false && !isAdmin) {
      showToast('This quiz is currently inactive.', 'info');
      return;
    }
    if (!user || !userProfile) {
      setShowNameModal(true);
      return;
    }

    // Check if category requires access code
    const quizCategoryObj = categories.find(c => c.name === quiz.category);
    const requiresCode = quizCategoryObj?.requiresAccessCode && quiz.accessCode;
    
    if (requiresCode && !isAdmin) {
      setPromptAccessCodeQuiz(quiz);
      setUserEnteredCode('');
      setAccessCodeErrorMsg('');
      return;
    }

    setCurrentQuiz(quiz);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setScore(0);
    setShowResult(false);
    setAnswers(new Array(quiz.questions.length).fill(null));
    setTimeLeft(quiz.timeLimit);
    setIsTimeUp(false);
    setView('home');
  };

  const handleOptionSelect = (optionIndex: number) => {
    setSelectedOption(optionIndex);
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = optionIndex;
    setAnswers(newAnswers);
  };

  const handleTextAnswer = (text: string) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestionIndex] = text;
    setAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    if (currentQuiz && currentQuestionIndex < currentQuiz.questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      const nextAnswer = answers[nextIndex];
      if (currentQuiz.questions[nextIndex].type === 'fill_in_the_blank') {
        setSelectedOption(null);
      } else {
        setSelectedOption(typeof nextAnswer === 'number' ? nextAnswer : null);
      }
    } else {
      handleFinishQuiz();
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      const prevIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIndex);
      const prevAnswer = answers[prevIndex];
      if (currentQuiz.questions[prevIndex].type === 'fill_in_the_blank') {
        setSelectedOption(null);
      } else {
        setSelectedOption(typeof prevAnswer === 'number' ? prevAnswer : null);
      }
    }
  };

  const handleFinishQuiz = async (timeUp = false) => {
    if (!currentQuiz) return;
    
    let finalScore = 0;
    answers.forEach((ans, idx) => {
      const q = currentQuiz.questions[idx];
      if (q.type === 'fill_in_the_blank') {
        const correctAnsText = q.correctAnswerText || '';
        const userAnsText = String(ans || '').trim().toLowerCase();
        const possibleAnswers = correctAnsText.split(',').map(a => a.trim().toLowerCase());
        if (possibleAnswers.includes(userAnsText)) {
          finalScore++;
        }
      } else {
        if (ans === q.correctAnswer) {
          finalScore++;
        }
      }
    });

    const finalTimeTaken = currentQuiz.timeLimit - timeLeft;
    setScore(finalScore);
    setTimeTaken(finalTimeTaken);
    setIsTimeUp(timeUp);
    setShowResult(true);

    // Save score to Firestore
    if (user && userProfile) {
      try {
        await addDoc(collection(db, 'scores'), {
          uid: user.uid,
          displayName: userProfile.displayName,
          photoURL: userProfile.photoURL || '',
          quizId: currentQuiz.id,
          quizTitle: currentQuiz.title,
          category: currentQuiz.category || 'Uncategorized',
          score: finalScore,
          totalQuestions: currentQuiz.questions.length,
          accuracy: (finalScore / currentQuiz.questions.length) * 100,
          timeTaken: finalTimeTaken,
          createdAt: serverTimestamp(),
          userAnswers: answers,
          questions: currentQuiz.questions
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'scores');
      }
    }
  };

  const resetQuiz = () => {
    setCurrentQuiz(null);
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setScore(0);
    setShowResult(false);
    setAnswers([]);
    setIsTimeUp(false);
    setView('home');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleShareResult = async () => {
    if (!currentQuiz) return;
    
    const accuracy = Math.round((score / currentQuiz.questions.length) * 100);
    const timeString = formatTime(timeTaken);
    const shareText = `🎯 I scored ${score}/${currentQuiz.questions.length} (${accuracy}% accuracy) in the "${currentQuiz.title}" quiz on Quiz Space in ${timeString}! Can you beat my score?`;
    const shareUrl = window.location.origin;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Quiz Space - ${currentQuiz.title}`,
          text: shareText,
          url: shareUrl,
        });
        showToast('Shared successfully!', 'success');
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          showToast('Sharing failed. Copying to clipboard instead.', 'info');
          copyToClipboard(shareText);
        }
      }
    } else {
      copyToClipboard(shareText);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast('Result summary copied to clipboard! Share it anywhere.', 'success');
      })
      .catch((err) => {
        console.error('Could not copy performance summary: ', err);
        showToast('Could not copy summary to clipboard.', 'error');
      });
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans selection:bg-emerald-100">
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            className={`flex items-center gap-2 ${currentQuiz && !showResult ? 'cursor-default' : 'cursor-pointer'}`} 
            onClick={() => {
              if (currentQuiz && !showResult) {
                showToast("You must finish the quiz before leaving.", "info");
                return;
              }
              resetQuiz();
            }}
          >
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <BookOpen className="text-white w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold tracking-tight text-lg leading-none">Quiz Space</span>
              {currentQuiz && !showResult && (
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Quiz in Progress</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {currentQuiz && !showResult ? (
              <div className="flex items-center gap-6 text-sm font-medium">
                <div className={`flex items-center gap-1.5 ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-black/40'}`}>
                  <Clock className="w-4 h-4" />
                  <span className="font-mono">{formatTime(timeLeft)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-black/40">
                  <Layout className="w-4 h-4" />
                  <span>{currentQuestionIndex + 1} / {currentQuiz.questions.length}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {user && userProfile ? (
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setShowProfileModal(true)}
                      className="flex items-center gap-3 px-3 py-1.5 rounded-2xl hover:bg-black/5 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center overflow-hidden border border-black/5">
                        {userProfile?.photoURL ? (
                          <img src={userProfile.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <UserIcon className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>
                      <div className="hidden sm:flex flex-col items-start">
                        <span className="text-xs font-semibold group-hover:text-emerald-600 transition-colors">{userProfile?.displayName || 'User'}</span>
                        <span className="text-[9px] text-black/30 font-bold uppercase tracking-widest">{userProfile?.role || 'Student'}</span>
                      </div>
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={() => setView('admin')}
                        className={`p-2 rounded-xl transition-all ${view === 'admin' ? 'text-emerald-600 bg-emerald-50' : 'text-black/20 hover:text-emerald-600 hover:bg-emerald-50'}`}
                        title="Admin Dashboard"
                      >
                        <Settings className="w-5 h-5" />
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        if (currentQuiz && !showResult) {
                          showToast("Please finish the quiz before signing out.", "info");
                          return;
                        }
                        handleLogout();
                      }}
                      className={`p-2 rounded-xl transition-all ${currentQuiz && !showResult ? 'text-black/10 cursor-not-allowed' : 'text-black/20 hover:text-red-500 hover:bg-red-50'}`}
                      title={currentQuiz && !showResult ? "Finish quiz to sign out" : "Sign Out"}
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleGoogleLogin}
                      className="flex items-center gap-2 bg-white border border-black/5 text-black px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold hover:bg-black/5 transition-colors"
                    >
                      <LogIn className="w-4 h-4" />
                      <span className="hidden sm:inline">Admin Login</span>
                      <span className="sm:hidden">Admin</span>
                    </button>
                    <button 
                      onClick={() => setShowNameModal(true)}
                      className="flex items-center gap-2 bg-emerald-600 text-white px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold hover:bg-emerald-700 transition-colors"
                    >
                      <UserIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Set Name</span>
                      <span className="sm:hidden">Name</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {(!isOnline || !isFirestoreReachable) && (
        <div className="bg-amber-500 text-white text-xs sm:text-sm px-6 py-2.5 text-center font-semibold font-sans flex items-center justify-center gap-2 shadow-sm animate-fadeIn sticky top-16 z-20">
          <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
          <span>Currently operating offline. Content loads from local cache and your live progress will sync automatically.</span>
        </div>
      )}
      
      <main className="max-w-4xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {!currentQuiz ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                  <h1 className="text-5xl font-light tracking-tight leading-none text-black">
                    Master Any Subject with <span className="text-emerald-600 font-medium italic">Quiz Space</span>
                  </h1>
                  <p className="text-black/50 text-xl max-w-2xl leading-relaxed">
                    A universal platform to test your knowledge across all fields. Create your own quizzes or solve existing ones.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setView('home')}
                    className={`px-6 py-3 rounded-2xl text-sm font-semibold transition-all ${view === 'home' ? 'bg-black text-white shadow-lg' : 'bg-white border border-black/5 text-black/40 hover:bg-black/5'}`}
                  >
                    Quizzes
                  </button>
                  <button 
                    onClick={() => setView('leaderboard')}
                    className={`px-6 py-3 rounded-2xl text-sm font-semibold transition-all ${view === 'leaderboard' ? 'bg-black text-white shadow-lg' : 'bg-white border border-black/5 text-black/40 hover:bg-black/5'}`}
                  >
                    Leaderboard
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={() => setView('admin')}
                      className={`px-6 py-3 rounded-2xl text-sm font-semibold transition-all flex items-center gap-2 ${view === 'admin' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100'}`}
                    >
                      <Settings className="w-4 h-4" />
                      Admin Dashboard
                    </button>
                  )}
                  <button 
                    onClick={handleShare}
                    className="px-6 py-3 rounded-2xl text-sm font-semibold transition-all bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center gap-2"
                    title="Copy shareable link"
                  >
                    {showShareToast ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                    <span className="hidden sm:inline">{showShareToast ? 'Copied!' : 'Share App'}</span>
                  </button>
                </div>
              </div>

              {view === 'home' ? (
                <div className="space-y-8">
                  {/* Category Filter Dropdown */}
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 max-w-xs">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Filter className="w-4 h-4 text-black/20" />
                      </div>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-black/5 rounded-2xl text-sm font-semibold appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-600/20 transition-all cursor-pointer shadow-sm hover:border-black/10"
                      >
                        <option value="All">All Categories</option>
                        {categories.map((cat, idx) => (
                          <option key={`${cat.id}-${idx}`} value={cat.name}>{cat.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <ChevronRight className="w-4 h-4 text-black/20 rotate-90" />
                      </div>
                    </div>
                    <div className="text-xs font-bold text-black/20 uppercase tracking-widest hidden sm:block">
                      {allQuizzes.length} Quizzes Available
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {allQuizzes.length > 0 ? allQuizzes.map((quiz, qIdx) => (
                      <motion.button
                        key={`${quiz.id}-${qIdx}`}
                        whileHover={quiz.isActive !== false || isAdmin ? { scale: 1.02 } : {}}
                        whileTap={quiz.isActive !== false || isAdmin ? { scale: 0.98 } : {}}
                        onClick={() => handleStartQuiz(quiz)}
                        className={`group bg-white p-8 rounded-[24px] border border-black/5 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between h-full ${quiz.isActive === false ? 'opacity-50 grayscale' : ''}`}
                      >
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                              quiz.session === 'all' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {quiz.session === 'all' ? <Trophy className="w-6 h-6" /> : <BookOpen className="w-6 h-6" />}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {quiz.category && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                  {quiz.category}
                                </span>
                              )}
                              {categories.find(c => c.name === quiz.category)?.requiresAccessCode && quiz.accessCode && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded-lg flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-amber-600" />
                                  Passcode Required
                                </span>
                              )}
                              {quiz.isActive === false && (
                                <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-50 px-2 py-1 rounded-lg flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" />
                                  Inactive
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <h3 className="text-2xl font-medium tracking-tight group-hover:text-emerald-600 transition-colors">
                              {quiz.title}
                            </h3>
                            <p className="text-black/40 leading-snug">
                              {quiz.description}
                            </p>
                          </div>
                        </div>
                        <div className="mt-8 flex items-center justify-between pt-6 border-t border-black/5">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-black/20 uppercase tracking-widest">Questions</span>
                            <span className="text-sm font-semibold text-black/40">{quiz.questions.length}</span>
                          </div>
                          <div className="flex flex-col gap-1 text-right">
                            <span className="text-[10px] font-bold text-black/20 uppercase tracking-widest">Time Limit</span>
                            <span className="text-sm font-semibold text-black/40">{quiz.timeLimit / 60} mins</span>
                          </div>
                        </div>
                      </motion.button>
                    )) : (
                      <div className="md:col-span-2 py-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-black/5 rounded-2xl flex items-center justify-center mx-auto">
                          <Search className="text-black/20 w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-black/40 font-medium">No quizzes found in this category.</p>
                          <p className="text-black/20 text-sm">Try selecting another category or check back later.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : view === 'leaderboard' ? (
                <Leaderboard quizzes={allQuizzes} />
              ) : (
                <AdminDashboard 
                  customQuizzes={customQuizzes} 
                  categories={categories}
                  showToast={showToast}
                  showConfirm={showConfirm}
                  globalSettings={globalSettings}
                />
              )}
            </motion.div>
          ) : showResult ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] border border-black/5 p-12 shadow-xl space-y-12"
            >
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-emerald-50 rounded-full">
                  <Trophy className="w-12 h-12 text-emerald-600" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-medium tracking-tight">
                    {isTimeUp ? "Time's Up!" : "Quiz Completed!"}
                  </h2>
                  <p className="text-black/40 text-lg">
                    {isTimeUp ? "The timer ran out, but here is how you did." : `Great effort on completing the ${currentQuiz.title}`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#f9f9f9] p-8 rounded-3xl text-center space-y-1 border border-black/5">
                  <span className="text-sm font-semibold text-black/30 uppercase tracking-widest block">Score</span>
                  <span className="text-5xl font-light tracking-tighter">
                    {score}<span className="text-2xl text-black/20">/{currentQuiz.questions.length}</span>
                  </span>
                </div>
                <div className="bg-[#f9f9f9] p-8 rounded-3xl text-center space-y-1 border border-black/5">
                  <span className="text-sm font-semibold text-black/30 uppercase tracking-widest block">Accuracy</span>
                  <span className="text-5xl font-light tracking-tighter">
                    {Math.round((score / currentQuiz.questions.length) * 100)}%
                  </span>
                </div>
                <div className="bg-[#f9f9f9] p-8 rounded-3xl text-center space-y-1 border border-black/5">
                  <span className="text-sm font-semibold text-black/30 uppercase tracking-widest block">Time Taken</span>
                  <span className="text-5xl font-light tracking-tighter">
                    {formatTime(timeTaken)}
                  </span>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-medium px-2">Review Answers</h3>
                <div className="space-y-4">
                  {currentQuiz.questions.map((q, idx) => {
                    if (q.type === 'fill_in_the_blank') {
                      const correctAnsText = q.correctAnswerText || '';
                      const userAns = answers[idx];
                      const userAnsText = String(userAns || '').trim().toLowerCase();
                      const possibleAnswers = correctAnsText.split(',').map(a => a.trim().toLowerCase());
                      const isUserCorrect = possibleAnswers.includes(userAnsText);
                      const hasUserAnswer = userAns !== undefined && userAns !== null && userAns !== '';

                      return (
                        <div key={`${q.id}-${idx}`} className="p-6 rounded-2xl border border-black/5 bg-[#fcfcfc] space-y-4">
                          <div className="flex gap-4">
                            <span className="text-black/20 font-mono text-sm mt-1">{String(idx + 1).padStart(2, '0')}</span>
                            <div className="space-y-4 flex-1">
                              <p className="text-lg font-medium leading-tight">
                                {q.text} <span className="bg-emerald-50 text-[10px] text-emerald-700 font-bold px-2 py-0.5 rounded-md ml-1 font-sans uppercase tracking-wider">Fill-in</span>
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className={`p-3 rounded-xl text-sm border flex items-center justify-between ${
                                  hasUserAnswer 
                                    ? isUserCorrect 
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-100 font-medium' 
                                      : 'bg-red-50 text-red-800 border-red-100 font-medium'
                                    : 'bg-white border-black/5 text-black/40'
                                }`}>
                                  <div>
                                    <span className="block text-[10px] uppercase tracking-wider text-black/40">Your Answer</span>
                                    <span className="text-sm font-medium">{hasUserAnswer ? `"${userAns}"` : 'No Answer'}</span>
                                  </div>
                                  {hasUserAnswer ? (
                                    isUserCorrect ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                                  ) : null}
                                </div>
                                <div className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-800 border-emerald-100 border flex flex-col justify-center">
                                  <span className="block text-[10px] uppercase tracking-wider text-emerald-600/70">Correct Answer(s)</span>
                                  <span className="text-sm font-semibold">{correctAnsText}</span>
                                </div>
                              </div>
                              {q.explanation && (
                                <div className="flex items-start gap-2 p-4 bg-blue-50/50 rounded-xl text-sm text-blue-800/80 border border-blue-100/50">
                                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                  <p>{q.explanation}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={`${q.id}-${idx}`} className="p-6 rounded-2xl border border-black/5 bg-[#fcfcfc] space-y-4">
                        <div className="flex gap-4">
                          <span className="text-black/20 font-mono text-sm mt-1">{String(idx + 1).padStart(2, '0')}</span>
                          <div className="space-y-4 flex-1">
                            <p className="text-lg font-medium leading-tight">{q.text}</p>
                            <div className="grid grid-cols-1 gap-2">
                              {q.options.map((opt, optIdx) => {
                                const isCorrect = optIdx === q.correctAnswer;
                                const isUserAnswer = optIdx === answers[idx];
                                return (
                                  <div 
                                    key={optIdx}
                                    className={`p-3 rounded-xl text-sm flex items-center justify-between ${
                                      isCorrect ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                                      isUserAnswer ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-white border border-black/5 text-black/40'
                                    }`}
                                  >
                                    <span>{opt}</span>
                                    {isCorrect && <CheckCircle2 className="w-4 h-4" />}
                                    {isUserAnswer && !isCorrect && <XCircle className="w-4 h-4" />}
                                  </div>
                                );
                              })}
                            </div>
                            {q.explanation && (
                              <div className="flex items-start gap-2 p-4 bg-blue-50/50 rounded-xl text-sm text-blue-800/80 border border-blue-100/50">
                                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                <p>{q.explanation}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <button
                  onClick={handleShareResult}
                  className="flex-1 bg-emerald-600 text-white py-5 rounded-2xl font-semibold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Share2 className="w-5 h-5" />
                  Share My Result
                </button>
                <button
                  onClick={resetQuiz}
                  className="flex-1 bg-black text-white py-5 rounded-2xl font-semibold hover:bg-black/80 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCcw className="w-5 h-5" />
                  Try Another Quiz
                </button>
                <button
                  onClick={() => { resetQuiz(); setView('leaderboard'); }}
                  className="flex-1 bg-white border border-black/5 text-black py-5 rounded-2xl font-semibold hover:bg-black/5 transition-all flex items-center justify-center gap-2"
                >
                  <Medal className="w-5 h-5" />
                  View Leaderboard
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-600/40 font-medium cursor-default">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs uppercase tracking-widest font-bold">Locked Session</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`flex items-center gap-2 font-mono text-sm ${timeLeft < 60 ? 'text-red-500 font-bold' : 'text-black/40'}`}>
                    <Clock className="w-4 h-4" />
                    <span>{formatTime(timeLeft)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-emerald-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-black/20">
                  <span>Progress</span>
                  <span>{Math.round(((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100)}%</span>
                </div>
              </div>

              <div className="space-y-10">
                <div className="space-y-4">
                  <span className="text-emerald-600 font-mono text-sm font-bold tracking-widest uppercase">
                    Question {currentQuestionIndex + 1}
                  </span>
                  <h2 className="text-3xl font-medium tracking-tight leading-tight">
                    {currentQuiz.questions[currentQuestionIndex].text}
                  </h2>
                </div>

                {currentQuiz.questions[currentQuestionIndex].type === 'fill_in_the_blank' ? (
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-black/30 uppercase tracking-widest block font-sans">Type your answer below</label>
                    <input 
                      type="text"
                      value={answers[currentQuestionIndex] !== null && answers[currentQuestionIndex] !== undefined ? String(answers[currentQuestionIndex]) : ''}
                      onChange={(e) => handleTextAnswer(e.target.value)}
                      placeholder="Type your answer here..."
                      className="w-full bg-white border border-black/10 rounded-2xl p-6 text-xl font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all shadow-sm font-sans"
                    />
                    <p className="text-xs text-black/40 italic font-sans font-medium">Note: Answers are case-insensitive and whitespace trimmed.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 font-sans">
                    {currentQuiz.questions[currentQuestionIndex].options.map((option, idx) => {
                      const isSelected = selectedOption === idx;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleOptionSelect(idx)}
                          className={`p-6 rounded-2xl border text-left transition-all relative overflow-hidden group ${
                            isSelected
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                              : 'bg-white border-black/5 hover:border-emerald-600/30 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center gap-4 relative z-10">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm transition-colors ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-black/5 text-black/40 group-hover:bg-emerald-600 group-hover:text-white'
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </div>
                            <span className="text-lg font-medium">{option}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-4 pt-6">
                  <button
                    onClick={handlePrevQuestion}
                    disabled={currentQuestionIndex === 0}
                    className="flex-1 bg-white border border-black/5 text-black/60 py-5 rounded-2xl font-semibold hover:bg-black/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed font-sans"
                  >
                    Previous
                  </button>
                  <button
                    onClick={handleNextQuestion}
                    disabled={
                      currentQuiz.questions[currentQuestionIndex].type === 'fill_in_the_blank'
                        ? !answers[currentQuestionIndex]
                        : selectedOption === null
                    }
                    className="flex-[2] bg-black text-white py-5 rounded-2xl font-semibold hover:bg-black/80 transition-all flex items-center justify-center gap-2 group disabled:opacity-30 disabled:cursor-not-allowed font-sans"
                  >
                    {currentQuestionIndex === currentQuiz.questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform font-sans" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-4xl mx-auto px-6 py-12 border-t border-black/5 text-center space-y-2">
        <p className="text-black/20 text-sm font-medium uppercase tracking-[0.2em]">
          Quiz Space • Universal Learning Platform
        </p>
        <p className="text-black/80 text-xs font-bold">
          © 2026 Digital Home. All rights reserved
        </p>
      </footer>

      {/* Name Entry Modal */}
      <AnimatePresence>
        {showNameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNameModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <UserIcon className="text-emerald-600 w-8 h-8" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">Welcome to Quiz Space</h2>
                <p className="text-black/40 text-sm">Enter your name to join or log back in to your account.</p>
              </div>

              <form onSubmit={handleJoin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest px-1">Your Name</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    placeholder="e.g. Kwesi Mensah"
                    className="w-full bg-[#f9f9f9] border border-black/5 rounded-2xl px-6 py-4 outline-none focus:border-emerald-600/30 focus:bg-white transition-all font-medium"
                    maxLength={25}
                  />
                </div>
                <button 
                  disabled={!tempName.trim() || isSubmittingName}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmittingName ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Continue to Quiz
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {promptAccessCodeQuiz && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPromptAccessCodeQuiz(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl space-y-6"
            >
              <button 
                onClick={() => setPromptAccessCodeQuiz(null)}
                className="absolute top-6 right-6 text-black/20 hover:text-black/60 transition-colors"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Lock className="text-amber-600 w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight font-sans">Passcode Protected Quiz</h2>
                <p className="text-black/40 text-sm font-sans">
                  The quiz <strong className="font-semibold text-black/80">"{promptAccessCodeQuiz.title}"</strong> belongs to a protected category and requires an access code.
                </p>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleVerifyAccessCode(); }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-black/20 uppercase tracking-widest px-1">Quiz Access Code</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={userEnteredCode}
                    onChange={(e) => {
                      setUserEnteredCode(e.target.value);
                      if (accessCodeErrorMsg) setAccessCodeErrorMsg('');
                    }}
                    placeholder="Enter code to unlock..."
                    className="w-full bg-[#f9f9f9] border border-black/5 rounded-2xl px-6 py-4 outline-none focus:border-amber-600/30 focus:bg-white transition-all font-sans font-semibold tracking-wider text-center text-lg placeholder:tracking-normal placeholder:font-normal"
                  />
                  {accessCodeErrorMsg && (
                    <p className="text-xs text-red-500 font-medium font-sans px-1">
                      {accessCodeErrorMsg}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setPromptAccessCodeQuiz(null)}
                    className="flex-1 bg-black/5 text-black/60 py-4 rounded-2xl font-semibold hover:bg-black/10 transition-all text-sm font-sans"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={!userEnteredCode.trim()}
                    className="flex-1 bg-amber-600 text-white py-4 rounded-2xl font-semibold hover:bg-amber-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-sans"
                  >
                    Unlock Quiz
                    <Key className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {showProfileModal && (
          <ProfileModal 
            userProfile={userProfile} 
            onClose={() => setShowProfileModal(false)} 
            showToast={showToast}
          />
        )}
        {confirmState.isOpen && (
          <ConfirmModal 
            {...confirmState} 
            onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))} 
          />
        )}
        {toast && (
          <Toast 
            {...toast} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QuizApp />
    </ErrorBoundary>
  );
}
