'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Sparkles, Calendar, RefreshCw, AlertCircle, LogOut, Pencil } from 'lucide-react';

interface SupabaseMemoRow {
  id: string;
  content: string;
}

// Challenge Month configurations from July 5th, 2026 to January 2nd, 2027
const MONTH_CONFIGS = [
  { monthNum: 7, label: '7월', year: 2026, startDay: 5, endDay: 31 },
  { monthNum: 8, label: '8월', year: 2026, startDay: 1, endDay: 31 },
  { monthNum: 9, label: '9월', year: 2026, startDay: 1, endDay: 30 },
  { monthNum: 10, label: '10월', year: 2026, startDay: 1, endDay: 31 },
  { monthNum: 11, label: '11월', year: 2026, startDay: 1, endDay: 30 },
  { monthNum: 12, label: '12월', year: 2026, startDay: 1, endDay: 31 },
  { monthNum: 1, label: '1월', year: 2027, startDay: 1, endDay: 2 }
];

const CHALLENGE_START_DATE = '2026-07-05';
const TOTAL_CHALLENGE_DAYS = 182;

interface ParticipantData {
  id: string;
  name: string;
  checkedDates: string[]; // ISO string dates
  timeCapsuleUrl: string;
  isCurrentUser: boolean;
  isMock: boolean;
}

export default function ChallengeDashboard() {
  const [selectedMonth, setSelectedMonth] = useState<number>(7); // Defaults to July (7월)
  const [session, setSession] = useState<any>(null); // Supabase Auth Session
  
  const [userNickname, setUserNickname] = useState<string>('참가자 1'); 
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('참가자 1');
  
  const [checkedDates, setCheckedDates] = useState<string[]>([]); // Current user's stamps
  const [timeCapsuleUrl, setTimeCapsuleUrl] = useState<string>(''); // Current user's Time Capsule URL
  
  const [dbMemos, setDbMemos] = useState<SupabaseMemoRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDaysView, setShowDaysView] = useState(false); // Toggle to show "Day X" instead of "Month.Day"
  const [error, setError] = useState<string | null>(null);
  
  const [isOfflineMode, setIsOfflineMode] = useState(false); // Local backup state
  const [isTableMissing, setIsTableMissing] = useState(false); // Specific banner for missing public.memos table
  const [showInAppBrowserModal, setShowInAppBrowserModal] = useState(false); // For iOS Naver/Instagram bypass
  const [isMobileDevice, setIsMobileDevice] = useState(false); // Manually show escape hatch for mobile users

  const nameInputRef = useRef<HTMLInputElement>(null);

  // In-app browser detection on mount (only auto-open modal for iOS)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      const isInApp = 
        userAgent.indexOf('kakaotalk') > -1 ||
        userAgent.indexOf('instagram') > -1 ||
        userAgent.indexOf('fbav') > -1 ||
        userAgent.indexOf('fban') > -1 ||
        userAgent.indexOf('naver') > -1 ||
        userAgent.indexOf('band') > -1 ||
        userAgent.indexOf('line') > -1 ||
        userAgent.indexOf('wv') > -1 ||
        userAgent.indexOf('gsa') > -1 ||
        userAgent.indexOf('slack') > -1 ||
        userAgent.indexOf('twitter') > -1 ||
        userAgent.indexOf('tiktok') > -1 ||
        userAgent.indexOf('inapp') > -1;

      if (isInApp) {
        const isIos = /iphone|ipad|ipod/.test(userAgent);
        // iOS users get the guide modal automatically on mount
        if (isIos) {
          setShowInAppBrowserModal(true);
        }
      }
    }
  }, []);

  // 1. Auth Listener with detailed initialization error catch
  useEffect(() => {
    try {
      if (!supabase) {
        throw new Error('Supabase 클라이언트 객체가 존재하지 않습니다. 라이브러리 초기화 오류.');
      }
      
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSession(session);
        }
      }).catch(err => {
        console.warn('Supabase getSession failed, entering offline mode:', err);
        setIsOfflineMode(true);
        setError(`인증 세션 로드 실패 (Supabase 설정 오류 가능성): ${err.message || JSON.stringify(err)}`);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => {
        subscription?.unsubscribe();
      };
    } catch (e: any) {
      console.warn('Auth initialization error:', e);
      setIsOfflineMode(true);
      setError(`Supabase 초기화 오류 (환경 변수 누락 가능성): ${e.message || JSON.stringify(e)}`);
    }
  }, []);

  // Focus input when editing name
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditingName]);

  // Load offline data backup on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /android|iphone|ipad|ipod/.test(userAgent);
      setIsMobileDevice(mobile);
    }

    const savedLocalStamps = localStorage.getItem('local_checked_stamps_v5');
    const savedLocalUrl = localStorage.getItem('local_time_capsule_url_v5');
    const savedLocalName = localStorage.getItem('local_user_nickname_v5');

    if (savedLocalStamps) {
      try { setCheckedDates(JSON.parse(savedLocalStamps)); } catch (e) {}
    }
    if (savedLocalUrl) {
      setTimeCapsuleUrl(savedLocalUrl);
    }
    if (savedLocalName) {
      setUserNickname(savedLocalName);
      setNameInput(savedLocalName);
    }
  }, []);

  // Fetch verified dates, URL, and Nicknames from Supabase memos table
  const fetchStamps = async () => {
    setIsLoading(true);
    // Do not clear the initialization error if set by the useEffect catch
    try {
      const { data, error: dbError } = await supabase
        .from('memos')
        .select('id, content');

      if (dbError) {
        if (dbError.code === '42P01') {
          setIsTableMissing(true);
        }
        throw dbError;
      }

      if (data) {
        setDbMemos(data);
        setIsOfflineMode(false);
        setIsTableMissing(false);
        const userId = session?.user?.id || 'local';

        // 1. Parse checked stamps for current user
        const stampPrefix = `stamp:${userId}:`;
        const stamps = data
          .filter(row => row.content && row.content.startsWith(stampPrefix))
          .map(row => row.content.replace(stampPrefix, ''));
        
        setCheckedDates(stamps);
        localStorage.setItem('local_checked_stamps_v5', JSON.stringify(stamps));

        // 2. Parse Time Capsule URL for current user
        const urlPrefix = `url:${userId}:`;
        const urlRow = data.find(row => row.content && row.content.startsWith(urlPrefix));
        if (urlRow) {
          const urlVal = urlRow.content.replace(urlPrefix, '');
          setTimeCapsuleUrl(urlVal);
          localStorage.setItem('local_time_capsule_url_v5', urlVal);
        }

        // 3. Parse Custom Nickname for current user
        const nicknamePrefix = `profile_nickname:${userId}:`;
        const nicknameRow = data.find(row => row.content && row.content.startsWith(nicknamePrefix));
        if (nicknameRow) {
          const nameVal = nicknameRow.content.replace(nicknamePrefix, '');
          setUserNickname(nameVal);
          setNameInput(nameVal);
          localStorage.setItem('local_user_nickname_v5', nameVal);
        } else if (session?.user) {
          const googleName = session.user.user_metadata?.full_name || '참가자 1';
          setUserNickname(googleName);
          setNameInput(googleName);
          localStorage.setItem('local_user_nickname_v5', googleName);
        }

        // 4. Auto-register new logged in user into database if not present
        if (session?.user) {
          const hasNickname = data.some(row => row.content && row.content.startsWith(`profile_nickname:${userId}:`));
          const hasJoinTime = data.some(row => row.content && row.content.startsWith(`join_time:${userId}:`));

          if (!hasNickname || !hasJoinTime) {
            const googleName = session.user.user_metadata?.full_name || '참가자';
            const inserts = [];
            if (!hasNickname) {
              inserts.push({ content: `profile_nickname:${userId}:${googleName}` });
            }
            if (!hasJoinTime) {
              inserts.push({ content: `join_time:${userId}:${Date.now()}` });
            }
            const { error: insertError } = await supabase.from('memos').insert(inserts);
            if (insertError) {
              console.error('Auto-registration failed:', insertError);
              setError(`자동 가입 등록 실패: ${insertError.message}`);
            } else {
              // Re-fetch to sync state
              setTimeout(() => fetchStamps(), 300);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('Database fetch failed. Running in offline fallback mode:', err);
      setIsOfflineMode(true);
      setError(`데이터베이스 연결 실패: ${err.message || err.details || JSON.stringify(err)}`);

      // Offline mode fallback: show Google user's name if logged in
      if (session?.user) {
        const googleName = session.user.user_metadata?.full_name || '참가자 1';
        setUserNickname(googleName);
        setNameInput(googleName);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch stamps whenever session or auth state changes
  useEffect(() => {
    fetchStamps();

    let subscription: any = null;
    try {
      const channel = supabase
        .channel('realtime-challenge-stamps-v5')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'memos' },
          () => {
            fetchStamps();
          }
        )
        .subscribe();
      subscription = channel;
    } catch (e) {
      console.warn('Realtime channel subscription failed:', e);
    }

    return () => {
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [session]);

  // Google Sign In - ALWAYS trigger OAuth redirect with account selector
  const handleGoogleLogin = async () => {
    setError(null);
    setIsSubmitting(true);

    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      const isInApp = userAgent.indexOf('naver') > -1 || userAgent.indexOf('instagram') > -1 || userAgent.indexOf('fbav') > -1 || userAgent.indexOf('line') > -1;

      // 1. KakaoTalk: Intercept, try automatic redirect, and always show guidance modal as a fallback
      if (userAgent.indexOf('kakaotalk') > -1) {
        setShowInAppBrowserModal(true); // Show modal immediately so the user isn't stuck if the redirect is blocked
        try {
          const currentUrl = window.location.href.split('?')[0].split('#')[0];
          const autoLoginUrl = `${currentUrl}?autoLogin=true`;
          window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(autoLoginUrl);
        } catch (e) {
          console.warn('Kakao automatic redirect failed:', e);
        }
        setIsSubmitting(false);
        return;
      }

      // 2. Android In-App (Naver, etc.): Attempt automatic redirect using Intent scheme
      const isAndroid = userAgent.indexOf('android') > -1;
      if (isAndroid && isInApp) {
        try {
          const currentUrl = window.location.href.split('?')[0].split('#')[0];
          const autoLoginUrl = `${currentUrl}?autoLogin=true`;
          const rawUrl = autoLoginUrl.replace(/^https?:\/\//, '');
          const intentUrl = `intent://${rawUrl}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
          
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = intentUrl;
          document.body.appendChild(iframe);
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
          
          // Fallback modal shown in background
          setShowInAppBrowserModal(true);
          setIsSubmitting(false);
          return;
        } catch (e) {
          console.warn('Android automatic intent failed:', e);
        }
      }

      // 3. iOS In-App (Naver, Instagram, etc.): Automatic redirect blocked, show guide modal
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      if (isIOS && isInApp) {
        setShowInAppBrowserModal(true);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const { error: loginError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.href.split('?')[0].split('#')[0] : undefined,
          queryParams: {
            prompt: 'select_account'
          }
        }
      });
      if (loginError) throw loginError;
    } catch (err: any) {
      console.warn('Google login redirection failed:', err);
      setError(`구글 로그인 연동 실패: ${err.message || '네트워크 연결 오류'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Automatically trigger Google Login if opened with ?autoLogin=true (e.g. redirected from Kakao/Naver)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const isAutoLogin = urlParams.get('autoLogin') === 'true';
      
      if (isAutoLogin && !session && !isLoading) {
        const userAgent = navigator.userAgent.toLowerCase();
        const isInApp = userAgent.indexOf('naver') > -1 || 
                        userAgent.indexOf('instagram') > -1 || 
                        userAgent.indexOf('fbav') > -1 || 
                        userAgent.indexOf('line') > -1 || 
                        userAgent.indexOf('kakaotalk') > -1;
                        
        if (!isInApp) {
          // Clean up the URL query parameter so it doesn't loop
          const currentPath = window.location.href.split('?')[0].split('#')[0];
          window.history.replaceState({}, document.title, currentPath);
          
          // Trigger Google Login
          handleGoogleLogin();
        }
      }
    }
  }, [session, isLoading]);


  // Manual force escape for mobile in-app WebViews
  const handleForceEscapeBrowser = () => {
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent.toLowerCase();
      
      // Always show the guidance modal first so the user gets instant visual feedback
      setShowInAppBrowserModal(true);
      
      // 1. KakaoTalk: Attempt redirect to external browser
      if (userAgent.indexOf('kakaotalk') > -1) {
        try {
          const currentUrl = window.location.href.split('?')[0].split('#')[0];
          const autoLoginUrl = `${currentUrl}?autoLogin=true`;
          window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(autoLoginUrl);
        } catch (e) {
          console.warn('Kakao redirect failed:', e);
        }
      }

      // 2. Android: Attempt intent scheme redirect for Naver and other apps
      const isAndroid = userAgent.indexOf('android') > -1;
      if (isAndroid) {
        try {
          const currentUrl = window.location.href.split('?')[0].split('#')[0];
          const autoLoginUrl = `${currentUrl}?autoLogin=true`;
          const rawUrl = autoLoginUrl.replace(/^https?:\/\//, '');
          const intentUrl = `intent://${rawUrl}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
          
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = intentUrl;
          document.body.appendChild(iframe);
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        } catch (e) {
          console.warn('Intent redirect failed:', e);
        }
      }
    }
  };

  // Explicit Mock Login trigger for offline/sandbox testing
  const handleTriggerMockLogin = () => {
    setIsOfflineMode(true);
    setError(null);
    const mockSession = {
      user: {
        id: 'mock-user-seunghee',
        email: 'seunghee@google.com',
        user_metadata: {
          full_name: 'Seunghee Huh'
        }
      }
    };
    setSession(mockSession);
    setUserNickname('Seunghee Huh');
    setNameInput('Seunghee Huh');
    localStorage.setItem('local_user_nickname_v5', 'Seunghee Huh');
  };

  // Logout
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Database signOut error:', err);
    }
    setSession(null);
    setUserNickname('참가자 1');
    setNameInput('참가자 1');
    setCheckedDates([]);
    setTimeCapsuleUrl('');
    localStorage.removeItem('local_user_nickname_v5');
    localStorage.removeItem('local_time_capsule_url_v5');
    localStorage.removeItem('local_checked_stamps_v5');
  };

  // Save Custom Nickname
  const handleSaveNickname = async () => {
    const nextName = nameInput.trim();
    if (!nextName) {
      setNameInput(userNickname);
      setIsEditingName(false);
      return;
    }

    setUserNickname(nextName);
    localStorage.setItem('local_user_nickname_v5', nextName);
    setIsEditingName(false);

    const userId = session?.user?.id || 'local';
    const nicknamePrefix = `profile_nickname:${userId}:`;
    const fullContent = `${nicknamePrefix}${nextName}`;

    try {
      const existingRow = dbMemos.find(row => row.content && row.content.startsWith(nicknamePrefix));
      const { error: writeError } = existingRow 
        ? await supabase.from('memos').update({ content: fullContent }).eq('id', existingRow.id)
        : await supabase.from('memos').insert([{ content: fullContent }]);

      if (writeError) {
        setError(`닉네임 저장 실패: ${writeError.message}`);
      } else {
        fetchStamps();
      }
    } catch (err) {
      console.warn('Failed to save nickname to Supabase:', err);
    }
  };

  // Toggle checked date stamp
  const handleToggleStamp = async (dateIsoStr: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const isCurrentlyChecked = checkedDates.includes(dateIsoStr);
    const nextCheckedDates = isCurrentlyChecked
      ? checkedDates.filter(d => d !== dateIsoStr)
      : [...checkedDates, dateIsoStr];

    setCheckedDates(nextCheckedDates);
    localStorage.setItem('local_checked_stamps_v5', JSON.stringify(nextCheckedDates));

    const userId = session?.user?.id || 'local';
    const stampPrefix = `stamp:${userId}:`;
    const fullContent = `${stampPrefix}${dateIsoStr}`;

    try {
      const { error: writeError } = isCurrentlyChecked
        ? await supabase.from('memos').delete().eq('content', fullContent)
        : await supabase.from('memos').insert([{ content: fullContent }]);

      if (writeError) {
        setError(`체크 상태 저장 실패: ${writeError.message}`);
      } else {
        fetchStamps();
      }
    } catch (err: any) {
      console.warn('Failed to sync stamp update with Supabase, holding local state:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Time Capsule URL
  const handleSaveUrl = async (urlVal: string) => {
    setTimeCapsuleUrl(urlVal);
    localStorage.setItem('local_time_capsule_url_v5', urlVal);

    const userId = session?.user?.id || 'local';
    const urlPrefix = `url:${userId}:`;
    const fullContent = `${urlPrefix}${urlVal}`;

    try {
      const urlRow = dbMemos.find(row => row.content && row.content.startsWith(urlPrefix));
      const { error: writeError } = urlRow
        ? await supabase.from('memos').update({ content: fullContent }).eq('id', urlRow.id)
        : await supabase.from('memos').insert([{ content: fullContent }]);

      if (writeError) {
        setError(`타임캡슐 URL 저장 실패: ${writeError.message}`);
      } else {
        fetchStamps();
      }
    } catch (err) {
      console.warn('Failed to save URL to Supabase:', err);
    }
  };

  // Helper to calculate sequential Day number since July 5th, 2026
  const getChallengeDayIndex = (dateIsoStr: string) => {
    const start = new Date(CHALLENGE_START_DATE);
    const current = new Date(dateIsoStr);
    start.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);
    const diffTime = current.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  // Generate list of days for active month
  const activeMonthDays = useMemo(() => {
    const config = MONTH_CONFIGS.find(c => c.monthNum === selectedMonth);
    if (!config) return [];
    
    const list = [];
    for (let i = config.startDay; i <= config.endDay; i++) {
      const formattedMonth = String(selectedMonth).padStart(2, '0');
      const formattedDay = String(i).padStart(2, '0');
      const isoStr = `${config.year}-${formattedMonth}-${formattedDay}`;
      
      const dateLabel = `${selectedMonth}.${i}`;
      const dayIndex = getChallengeDayIndex(isoStr);
      const dayIndexLabel = `${dayIndex}일`;

      list.push({ 
        isoStr, 
        label: showDaysView ? dayIndexLabel : dateLabel,
        dayNum: i,
        dayIndex
      });
    }
    return list;
  }, [selectedMonth, showDaysView]);

  // Compute total days in selected month
  const activeMonthTotalDays = useMemo(() => {
    const config = MONTH_CONFIGS.find(c => c.monthNum === selectedMonth);
    if (!config) return 30;
    return config.endDay - config.startDay + 1;
  }, [selectedMonth]);

  // Today's Date representation (e.g. "7.2")
  const todayLabel = useMemo(() => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    return `${month}.${day}`;
  }, []);

  // Today's Date representation in Day X (e.g. "1일")
  const todayDayIndexLabel = useMemo(() => {
    const today = new Date();
    const formattedYear = today.getFullYear();
    const formattedMonth = String(today.getMonth() + 1).padStart(2, '0');
    const formattedDay = String(today.getDate()).padStart(2, '0');
    const isoStr = `${formattedYear}-${formattedMonth}-${formattedDay}`;
    const dayIdx = getChallengeDayIndex(isoStr);
    return dayIdx > 0 && dayIdx <= TOTAL_CHALLENGE_DAYS ? `${dayIdx}일` : '';
  }, []);

  // 2. MULTIPLAYER: Load all participants dynamically, sorted by their join order
  const dynamicParticipants = useMemo((): ParticipantData[] => {
    const currentUserId = session?.user?.id || 'local';
    
    // Find all unique user IDs that have database records using robust split logic
    const allUserIds = Array.from(new Set(
      dbMemos
        .map(row => {
          const content = row.content || '';
          const parts = content.split(':');
          if (parts.length >= 3) {
            const prefix = parts[0];
            if (prefix === 'stamp' || prefix === 'profile_nickname' || prefix === 'url' || prefix === 'join_time') {
              return parts[1]; // Returns USER_ID
            }
          }
          return null;
        })
        .filter((item): item is string => !!item)
    ));

    // Sort user IDs by join timestamp (ascending - oldest first)
    const sortedUserIds = allUserIds.sort((a, b) => {
      const timeARow = dbMemos.find(row => row.content && row.content.startsWith(`join_time:${a}:`));
      const timeBRow = dbMemos.find(row => row.content && row.content.startsWith(`join_time:${b}:`));
      const timeA = timeARow ? parseInt(timeARow.content.replace(`join_time:${a}:`, '')) : 9999999999999;
      const timeB = timeBRow ? parseInt(timeBRow.content.replace(`join_time:${b}:`, '')) : 9999999999999;
      return timeA - timeB;
    });

    // Map each user ID to participant data
    const realParticipants = sortedUserIds.map(uid => {
      const isCurrentUser = uid === currentUserId;
      
      // Parse nickname
      const nicknameRow = dbMemos.find(row => row.content && row.content.startsWith(`profile_nickname:${uid}:`));
      const nickname = nicknameRow 
        ? nicknameRow.content.replace(`profile_nickname:${uid}:`, '')
        : isCurrentUser ? userNickname : '참가자';

      // Parse checked stamps
      const stampPrefix = `stamp:${uid}:`;
      const stamps = dbMemos
        .filter(row => row.content && row.content.startsWith(stampPrefix))
        .map(row => row.content.replace(stampPrefix, ''));

      // Parse URL
      const urlRow = dbMemos.find(row => row.content && row.content.startsWith(`url:${uid}:`));
      const url = urlRow ? urlRow.content.replace(`url:${uid}:`, '') : '';

      return {
        id: uid,
        name: nickname,
        checkedDates: stamps,
        timeCapsuleUrl: url,
        isCurrentUser,
        isMock: false
      };
    });

    // Ensure current user is always included
    const hasCurrentUser = realParticipants.some(p => p.isCurrentUser);
    let result = [...realParticipants];
    
    if (!hasCurrentUser && session?.user) {
      result.push({
        id: currentUserId,
        name: userNickname,
        checkedDates: checkedDates,
        timeCapsuleUrl: timeCapsuleUrl,
        isCurrentUser: true,
        isMock: false
      });
    }

    // Pad with empty mock cards up to 14 participants, sequentially naming them '참가자 [index]'
    const neededMocksCount = 14 - result.length;
    for (let i = 1; i <= neededMocksCount; i++) {
      const participantIndex = result.length + 1;
      result.push({
        id: `mock-${i}`,
        name: `참가자 ${participantIndex}`,
        checkedDates: [],
        timeCapsuleUrl: `https://timecapsule.com/user${participantIndex}`,
        isCurrentUser: false,
        isMock: true
      });
    }

    return result;
  }, [dbMemos, session, userNickname, checkedDates, timeCapsuleUrl]);

  // Compute overall season stats (182 days total) for header display
  const myOverallCheckedCount = checkedDates.length;
  const myOverallPercentage = Math.round((myOverallCheckedCount / TOTAL_CHALLENGE_DAYS) * 100);

  // Dynamic Day calculation since July 5th, 2026
  const challengeDayNumber = useMemo(() => {
    const start = new Date(CHALLENGE_START_DATE);
    const today = new Date();
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - start.getTime();
    const diffDays = Math.ceil(today.getTime() - start.getTime() / (1000 * 60 * 60 * 24)) + 1; // Safeguard calculation
    const rawDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    if (rawDays <= 0) {
      const absDiff = Math.abs(rawDays - 1);
      return `D-${absDiff}`;
    }
    return rawDays <= TOTAL_CHALLENGE_DAYS ? `Day ${rawDays}` : '종료됨';
  }, []);

  // Robust clipboard copy handler for restricted in-app mobile WebViews
  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => alert('주소가 복사되었습니다! 크롬/Safari 앱을 열고 주소창에 붙여넣어 주세요.'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        alert('주소가 복사되었습니다! 크롬/Safari 앱을 열고 주소창에 붙여넣어 주세요.');
      } else {
        throw new Error('Copy command failed');
      }
    } catch (err) {
      // Prompt user to copy manually if even execCommand is blocked
      window.prompt('인앱 브라우저 보안으로 인해 자동 복사가 차단되었습니다.\n아래 주소를 길게 눌러 직접 복사해 주세요:', text);
    }
  };

  return (
    <div className="min-h-screen flex flex-col py-10 px-4 sm:px-6 lg:px-8 select-none">
      
      {/* Brand Header */}
      <div className="text-center mb-8 animate-fade-in flex flex-col items-center">
        
        {/* Main Title */}
        <h1 className="text-4xl sm:text-5xl font-[900] tracking-tight text-slate-800 flex items-center justify-center gap-2 drop-shadow-sm leading-tight">
          Consistency Wins
          <Sparkles className="w-6 h-6 text-sky-400 shrink-0" />
        </h1>

        {/* Subtitle: 꾸도챌 시즌2 */}
        <p className="mt-2 text-md sm:text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600 tracking-wide">
          꾸도챌 시즌2
        </p>

        {/* Badge Pill */}
        <div className="mt-4 inline-flex items-center gap-3 bg-white/80 border border-sky-100/50 rounded-full px-3.5 py-1.5 shadow-sm">
          <span className="bg-sky-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
            {challengeDayNumber}
          </span>
          <span className="text-[10px] font-bold text-slate-700">
            7월 5일 - 1월 2일
          </span>
        </div>

      </div>

      {/* Navigation and Selector Row */}
      <div className="w-full max-w-7xl mx-auto mb-8 flex flex-col gap-5 items-center">
        
        {/* Navigation buttons */}
        <div className="flex flex-wrap gap-2.5 items-center justify-center">
          
          {session ? (
            /* Logged In */
            <div 
              onClick={() => setIsEditingName(true)}
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-4 py-2 rounded-full flex items-center gap-1.5 font-bold text-xs shadow-md shadow-sky-500/10 hover:scale-105 transition-all duration-200 cursor-pointer"
            >
              <span>👋</span>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleSaveNickname}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNickname();
                    if (e.key === 'Escape') {
                      setNameInput(userNickname);
                      setIsEditingName(false);
                    }
                  }}
                  className="bg-transparent border-b border-white outline-none w-20 text-white text-xs font-bold"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>{userNickname}</span>
                  <Pencil className="w-2.5 h-2.5 opacity-80" />
                </span>
              )}
            </div>
          ) : (
            /* Logged Out */
            <div className="bg-slate-200 text-slate-500 px-4 py-2 rounded-full flex items-center gap-1 font-bold text-xs">
              <span>👋</span>
              <span>{userNickname}</span>
            </div>
          )}

          {session ? (
            <div 
              onClick={handleLogout}
              className="bg-white/80 backdrop-blur-md text-zinc-700 border border-sky-100/50 px-4 py-2 rounded-full flex items-center gap-1 font-bold text-xs shadow-sm cursor-pointer hover:bg-slate-50 hover:scale-105 transition-all duration-200"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span>로그아웃</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* Google Login */}
              <div 
                onClick={handleGoogleLogin}
                className="bg-white/80 backdrop-blur-md text-zinc-700 border border-sky-100/50 px-4 py-2 rounded-full flex items-center gap-1.5 font-bold text-xs shadow-sm cursor-pointer hover:bg-slate-50 hover:scale-105 transition-all duration-200"
              >
                <span className="flex items-center">
                  <span className="text-blue-500 font-extrabold text-[10px]">G</span>
                  <span className="text-red-500 font-extrabold text-[10px]">o</span>
                  <span className="text-yellow-500 font-extrabold text-[10px]">o</span>
                  <span className="text-blue-500 font-extrabold text-[10px]">g</span>
                  <span className="text-green-500 font-extrabold text-[10px]">l</span>
                  <span className="text-red-500 font-extrabold text-[10px]">e</span>
                </span>
                <span>로그인</span>
              </div>
              
              {/* Help escape button for Google OAuth issues in restricted webviews */}
              <button
                onClick={handleForceEscapeBrowser}
                className="mt-2.5 text-[9px] font-bold text-slate-500 hover:text-sky-500 underline decoration-dotted cursor-pointer flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full border border-slate-200/50 shadow-sm transition-colors"
              >
                <span>🌐</span> 구글 로그인 오류(403) 해결하기
              </button>
            </div>
          )}

          {/* Toggle View Mode */}
          <div 
            onClick={() => setShowDaysView(!showDaysView)}
            className={`border px-4 py-2 rounded-full flex items-center gap-1 font-bold text-xs transition-all duration-300 shadow-sm cursor-pointer hover:scale-105 ${
              showDaysView 
                ? 'bg-sky-500 text-white border-sky-500 shadow-md shadow-sky-500/10'
                : 'bg-white/80 text-zinc-700 border-sky-100/50 hover:bg-slate-50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>일차 보기</span>
          </div>
        </div>

        {/* Monthly Switcher Row */}
        <div className="flex flex-wrap gap-1.5 items-center justify-center p-1 bg-sky-500/5 border border-sky-100/50 rounded-full">
          {MONTH_CONFIGS.map(cfg => {
            const isSelected = selectedMonth === cfg.monthNum;
            return (
              <button
                key={`month-${cfg.monthNum}`}
                onClick={() => setSelectedMonth(cfg.monthNum)}
                className={`text-[10px] sm:text-xs font-black px-4.5 py-1.5 rounded-full transition-all duration-300 ${
                  isSelected 
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/10 scale-105' 
                    : 'text-slate-600 hover:text-sky-600 hover:bg-white/50'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

      </div>

      {/* Main 14 Participants Dashboard Layout */}
      <main className="w-full max-w-7xl mx-auto flex-1 flex flex-col justify-center">
        
        {/* CRITICAL: SQL Table Missing Warning Banner */}
        {isTableMissing && (
          <div className="mb-6 p-5 rounded-2xl bg-rose-500/10 border-2 border-rose-500/20 text-rose-700 text-xs leading-relaxed max-w-2xl mx-auto flex gap-3.5 items-start animate-fade-in shadow-md">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-rose-500" />
            <div>
              <p className="font-extrabold text-sm mb-1 text-rose-800">⚠️ 데이터베이스 설정 미완료 (memos 테이블 없음)</p>
              <p className="opacity-95 text-[11px] mb-3">
                현재 연결하신 Supabase 프로젝트 내에 **`memos`** 테이블이 존재하지 않습니다. 이로 인해 데이터베이스 읽기/쓰기가 실패하여 오프라인 모드로 자동 전환되었습니다. 아래 쿼리를 실행해 주셔야 실시간 데이터가 정상 연동됩니다!
              </p>
              <p className="font-bold mb-1 text-[11px] text-rose-800">💡 해결 방법 (Supabase 대시보드에서 실행)</p>
              <ol className="list-decimal pl-4 text-[10px] opacity-95 space-y-1.5 mb-3">
                <li>
                  새로 만드신 **[Supabase Dashboard](https://supabase.com/)** 프로젝트로 이동합니다.
                </li>
                <li>
                  좌측 메뉴 of SQL Editor로 이동한 뒤, **[New Query]**를 생성합니다.
                </li>
                <li>
                  아래의 SQL문을 그대로 복사해서 붙여넣고 우측 하단의 **[Run]** 버튼을 눌러 실행합니다:
                </li>
              </ol>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[10px] font-mono overflow-x-auto border border-slate-800 max-h-[160px] select-text">
{`CREATE TABLE public.memos (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  content text not null
);

ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select" ON public.memos FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.memos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.memos FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.memos FOR DELETE USING (true);`}
              </pre>
            </div>
          </div>
        )}

        {/* Offline fallback warning banner (Only show if not already showing missing table banner) */}
        {isOfflineMode && !isTableMissing && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/15 text-amber-600 text-xs leading-relaxed max-w-xl mx-auto flex gap-3 items-start animate-fade-in shadow-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold mb-1">📢 Supabase 오프라인 모드 활성화 안내</p>
              <p className="opacity-95 text-[11px] mb-1">
                현재 데이터베이스 연결이 일시적으로 불가능하여 **오프라인 모드**로 동작하고 있습니다. 닉네임과 스탬프 저장 기능은 브라우저 캐시(`localStorage`)를 통해 안전하게 유지되며 테스트 가능합니다.
              </p>
              
              {/* Detailed connection error log rendered directly inside the banner */}
              {error && (
                <div className="mt-2 mb-3 p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-500 text-[10px] font-mono select-text break-all">
                  <strong>🔴 상세 연결 오류:</strong> {error}
                </div>
              )}

              <button 
                onClick={handleTriggerMockLogin}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer transition-colors shadow-sm"
              >
                임시로 오프라인(Mock) 로그인으로 테스트하기
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
          
          {/* Render 14 dynamically loaded multiplayer participant cards */}
          {dynamicParticipants.map((participant) => {
            const config = MONTH_CONFIGS.find(c => c.monthNum === selectedMonth);
            const prefix = config ? `${config.year}-${String(selectedMonth).padStart(2, '0')}-` : '2026-07-';
            
            const monthCheckedCount = participant.checkedDates.filter(d => d.startsWith(prefix)).length;
            const monthPercentage = activeMonthTotalDays > 0 
              ? Math.round((monthCheckedCount / activeMonthTotalDays) * 100) 
              : 0;

            const overallCheckedCount = participant.checkedDates.length;
            const overallPercentage = Math.round((overallCheckedCount / TOTAL_CHALLENGE_DAYS) * 100);

            return (
              <div 
                key={participant.id}
                className={`glass-card rounded-[1.8rem] p-5 transition-all duration-300 flex flex-col justify-between ${
                  participant.isCurrentUser 
                    ? 'border-2 border-sky-400 glow-sky' 
                    : 'border border-sky-100/50'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-1.5">
                      {participant.isCurrentUser ? (
                        /* Current user can edit nickname */
                        isEditingName ? (
                          <input
                            ref={nameInputRef}
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onBlur={handleSaveNickname}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveNickname();
                              if (e.key === 'Escape') {
                                setNameInput(userNickname);
                                setIsEditingName(false);
                              }
                            }}
                            className="bg-slate-50 border border-sky-200 outline-none rounded px-1.5 py-0.5 text-base font-black w-24 text-zinc-800"
                          />
                        ) : (
                          <h2 
                            onClick={() => setIsEditingName(true)}
                            className="text-lg font-black text-zinc-800 cursor-pointer hover:text-sky-500 flex items-center gap-1.5 group"
                            title="클릭하여 이름 수정"
                          >
                            <span>{participant.name}</span>
                            <Pencil className="w-3.5 h-3.5 text-zinc-400 group-hover:text-sky-500 transition-colors" />
                          </h2>
                        )
                      ) : (
                        /* Read-only name for other participants */
                        <h2 className="text-lg font-black text-zinc-800">
                          {participant.name}
                        </h2>
                      )}

                      {participant.isCurrentUser && (
                        <span className="w-4 h-4 rounded-full bg-sky-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                          나
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-black text-zinc-800">
                        {monthCheckedCount}<span className="text-zinc-400 font-normal text-[10px]">/{activeMonthTotalDays}</span>
                      </div>
                      <div className="text-[9px] font-black text-sky-500">
                        {selectedMonth}월: {monthPercentage}%
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-4">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        participant.isCurrentUser 
                          ? 'bg-gradient-to-r from-sky-400 via-sky-500 to-blue-500 ease-out' 
                          : 'bg-slate-300'
                      }`}
                      style={{ width: `${monthPercentage}%` }}
                    />
                  </div>

                  {/* Stamp Grid */}
                  <div className={`grid grid-cols-10 gap-1.5 ${!participant.isCurrentUser ? 'pointer-events-none' : ''}`}>
                    {activeMonthDays.map((day) => {
                      const isChecked = participant.checkedDates.includes(day.isoStr);
                      const isToday = showDaysView 
                        ? (todayDayIndexLabel && day.label === todayDayIndexLabel)
                        : (day.label === todayLabel);

                      return participant.isCurrentUser ? (
                        /* Active toggle stamps for current user */
                        <button
                          key={`stamp-${participant.id}-${day.dayNum}`}
                          onClick={() => handleToggleStamp(day.isoStr)}
                          disabled={isLoading}
                          className={`w-6.5 h-6.5 rounded-full flex items-center justify-center text-[8px] font-black transition-all duration-200 border cursor-pointer hover:scale-110 ${
                            isChecked
                              ? 'bg-sky-500 border-sky-500 text-white shadow-sm shadow-sky-500/25'
                              : isToday
                                ? 'border border-pink-500 text-pink-500 bg-pink-500/5 font-black ring-1 ring-pink-500/10'
                                : 'bg-slate-100/70 border-slate-200/50 text-slate-500 hover:bg-sky-50 hover:text-sky-600'
                          }`}
                        >
                          {day.label}
                        </button>
                      ) : (
                        /* Read-only stamps for other participants */
                        <div
                          key={`stamp-${participant.id}-${day.dayNum}`}
                          className={`w-6.5 h-6.5 rounded-full flex items-center justify-center text-[8px] font-black border ${
                            isChecked
                              ? 'bg-slate-200 border-slate-200 text-slate-400'
                              : isToday
                                ? 'border border-pink-500 text-pink-500 bg-pink-500/5 font-black ring-1 ring-pink-500/10'
                                : 'bg-slate-50/50 border-slate-100/40 text-slate-300'
                          }`}
                        >
                          {day.label}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Time Capsule URL Section */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-500">타임캡슐 URL :</label>
                  {participant.isCurrentUser ? (
                    /* Current user can edit Time Capsule URL */
                    <input 
                      type="text"
                      value={timeCapsuleUrl}
                      onChange={(e) => handleSaveUrl(e.target.value)}
                      placeholder="타임캡슐 링크를 입력해 주세요..."
                      className="w-full bg-slate-50 border border-slate-200 focus:border-sky-300 outline-none rounded-lg px-2.5 py-1 text-[10px] text-slate-700 transition-all font-medium"
                    />
                  ) : (
                    /* Read-only Time Capsule URL for other participants */
                    <div className="w-full bg-slate-50/50 border border-slate-100 text-[10px] text-slate-400 rounded-lg px-2.5 py-1 truncate font-medium">
                      {participant.timeCapsuleUrl || 'URL 없음'}
                    </div>
                  )}
                </div>

                {/* Overall Season Progress footer */}
                <div className="mt-3 pt-3 border-t border-slate-100/80 flex justify-between items-center text-[9px] text-slate-400 font-bold">
                  <span>전체 시즌 달성률</span>
                  <span className={participant.isCurrentUser ? 'text-sky-500' : 'text-slate-500'}>
                    {overallCheckedCount}/{TOTAL_CHALLENGE_DAYS}일 ({overallPercentage}%)
                  </span>
                </div>
              </div>
            );
          })}

        </div>

        {/* Global Error/Status Indicator */}
        {error && (
          <div className="mt-8 p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 text-rose-500 text-xs flex gap-2.5 items-center max-w-md mx-auto">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

      </main>

      {/* Footer info */}
      <footer className="text-center mt-12 text-[10px] text-zinc-400 font-medium">
        © 2026 Kkudoki Challenge Dashboard. Syncing via Supabase.
      </footer>

      {/* Mobile In-App Browser Guidance Modal with robust inline styles */}
      {showInAppBrowserModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '28px',
            border: '1px solid #e0f2fe',
            padding: '24px',
            maxWidth: '360px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '9999px',
              backgroundColor: '#e0f2fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <AlertCircle className="w-6 h-6 text-sky-500" />
            </div>
            
            <h3 style={{
              fontSize: '18px',
              fontWeight: 900,
              color: '#0f172a',
              marginBottom: '8px'
            }}>구글 로그인 지원 안내</h3>
            
            <p style={{
              fontSize: '12px',
              color: '#64748b',
              lineHeight: '1.6',
              marginBottom: '20px'
            }}>
              현재 인앱 브라우저로 접속 중입니다. 구글 정책상 로그인을 하려면 외부 브라우저(Chrome/Safari)가 필요합니다.
            </p>
            
            <div style={{
              backgroundColor: '#f0f9ff',
              border: '1px solid rgba(14, 165, 233, 0.1)',
              borderRadius: '16px',
              padding: '16px',
              width: '100%',
              fontSize: '11px',
              color: '#0369a1',
              fontWeight: 'bold',
              marginBottom: '24px',
              textAlign: 'left',
              lineHeight: '1.6'
            }}>
              <p style={{ marginBottom: '8px', display: 'flex', alignItems: 'start', gap: '6px' }}>
                <span style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '9999px',
                  backgroundColor: '#0ea5e9',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  flexShrink: 0,
                  fontWeight: 900
                }}>1</span>
                <span>화면 우측 상단(또는 하단)의 <strong style={{ color: '#0284c7' }}>더보기(…)</strong> 또는 메뉴를 누릅니다.</span>
              </p>
              <p style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                <span style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '9999px',
                  backgroundColor: '#0ea5e9',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  flexShrink: 0,
                  fontWeight: 900
                }}>2</span>
                <span><strong style={{ color: '#0284c7' }}>[기본 브라우저로 열기]</strong> 또는 <strong style={{ color: '#0284c7' }}>[크롬/Safari로 열기]</strong>를 누릅니다.</span>
              </p>
            </div>

            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  copyToClipboard(window.location.href.split('?')[0]);
                }
              }}
              style={{
                width: '100%',
                backgroundColor: '#0ea5e9',
                color: '#ffffff',
                fontWeight: 'bold',
                padding: '14px 0',
                borderRadius: '16px',
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 10px 15px -3px rgba(14, 165, 233, 0.3)',
                transition: 'background-color 0.2s'
              }}
            >
              주소 복사하고 외부 브라우저에서 열기
            </button>

            {/* Close button to dismiss the guidance modal */}
            <button
              onClick={() => setShowInAppBrowserModal(false)}
              style={{
                marginTop: '12px',
                width: '100%',
                backgroundColor: 'transparent',
                color: '#64748b',
                fontWeight: 'bold',
                padding: '10px 0',
                borderRadius: '16px',
                fontSize: '12px',
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
