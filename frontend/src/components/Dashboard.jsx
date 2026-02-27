import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axiosConfig';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Background3D from './Background3D';
import LoadingIndicator from './LoadingIndicator';
import FloatingActionButton from './FloatingActionButton';
import DocumentModal from './DocumentModal';
import { LogOut, BarChart2, Users, Activity as ActivityIcon, TrendingUp, ChevronDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, BarChart, Bar } from 'recharts';

const Dashboard = ({ user, onLogout }) => {
    const [inputText, setInputText] = useState('');
    const [aiMode, setAiMode] = useState('standard');
    const [contentType, setContentType] = useState('Explanation');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);
    const [documents, setDocuments] = useState([]);
    const [activeTab, setActiveTab] = useState('generator');
    const [chatMessages, setChatMessages] = useState(() => {
        try {
            const saved = localStorage.getItem('chatMessages');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to parse chat messages", e);
            localStorage.removeItem('chatMessages');
            return [];
        }
    });
    const [typingId, setTypingId] = useState(null);
    const [displayContent, setDisplayContent] = useState({});
    const [selectedPdfForChat, setSelectedPdfForChat] = useState(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const pdfInputRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('chatMessages', JSON.stringify(chatMessages));
    }, [chatMessages]);
    const [historyItems, setHistoryItems] = useState([]);
    const [adminStats, setAdminStats] = useState(null);
    const [adminSummary, setAdminSummary] = useState(null);
    const [timeRange, setTimeRange] = useState('7'); // Default 7 days

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isRightBarOpen, setIsRightBarOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [openCategories, setOpenCategories] = useState({
        academic: false,
        technical: false,
        placement: false,
        advanced: false,
        creative: false
    });

    const categorizedContentTypes = {
        academic: {
            label: "Academic",
            icon: "🎓",
            types: [
                'Explanation',
                'Summary',
                'Assignment',
                'Viva Preparation',
                'Lab Report',
                'Motivation of Goals'
            ]
        },
        creative: {
            label: "Creative",
            icon: "✨",
            types: ['Article/Blog', 'Social Media Script', 'Creative Essay', 'Story Writing', 'Poetry/Lyrics']
        },
        technical: {
            label: "Technical",
            icon: "💻",
            types: ['Coding', 'Debugging', 'Algorithm Breakdown', 'Project Documentation', 'Project Ideas']
        },
        placement: {
            label: "Placement",
            icon: "🎯",
            types: ['Interview Q&A', 'Aptitude Practice']
        },
        advanced: {
            label: "Advanced",
            icon: "🧠",
            types: ['Paper Simplifier', 'Roadmap Generator']
        }
    };
    const actionMenuItems = [
        { label: 'Telescope', icon: '🔭', mode: 'telescope' },
        { label: 'Deep Research', icon: '🔬', mode: 'deep' },
        { label: 'Thinking Mode', icon: '💡', mode: 'thinking' },
        {
            label: 'Chat with PDF',
            icon: '📄',
            mode: 'pdf',
            visibleFor: ['Explanation', 'Summary', 'Lab Report', 'Viva Prep', 'Revision Notes', 'Assignment', 'Formula Sheet', 'Quiz', 'Motivation of Goals']
        }
    ];

    const toggleCategory = (cat) => {
        setOpenCategories(prev => ({
            ...prev,
            [cat]: !prev[cat]
        }));
    };

    const fetchHistory = async () => {
        try {
            const response = await api.get(`/api/history?user_id=${user.id || user.email}`);
            if (response.data.status === 'success') {
                const historyData = response.data.history;
                setHistoryItems(historyData);

                // Transform history to chat messages
                const formattedMessages = [];
                const displayContentMap = {};

                // Sort by date ascending for chronological order
                const sortedHistory = [...historyData].sort((a, b) =>
                    new Date(a.created_at) - new Date(b.created_at)
                );

                sortedHistory.forEach((item, index) => {
                    const userMsgId = `hist-user-${index}`;
                    const aiMsgId = `hist-ai-${index}`;

                    formattedMessages.push({
                        id: userMsgId,
                        type: 'user',
                        content: item.topic
                    });

                    formattedMessages.push({
                        id: aiMsgId,
                        type: 'ai',
                        content: item.response,
                        contentType: item.content_type,
                        topic: item.topic
                    });

                    displayContentMap[aiMsgId] = item.response;
                });

                setChatMessages(formattedMessages);
                setDisplayContent(displayContentMap);
            }
        } catch (error) { console.error('Error fetching history:', error); }
    };

    const fetchDocuments = async () => {
        try {
            const response = await api.get(`/api/documents?user_id=${user.id || user.email}`);
            if (response.data.status === 'success') setDocuments(response.data.documents);
        } catch (error) { console.error('Error fetching documents:', error); }
    };

    useEffect(() => {
        if (user) {
            fetchHistory();
            fetchDocuments();
        }
    }, [user]);

    const fetchAdminStats = async () => {
        if (!user || !user.email) return;
        try {
            const [statsRes, summaryRes, dauRes, newUsersRes, promptsRes, tokensRes, featureRes, stickinessRes, retentionRes, responseTimeRes, errorRateRes, avgPromptsRes] = await Promise.all([
                api.get(`/api/admin/stats?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/summary?admin_email=${user.email}`),
                api.get(`/api/admin/dau?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/new-users?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/prompts-per-day?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/token-usage?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/feature-usage?admin_email=${user.email}`),
                api.get(`/api/admin/stickiness?admin_email=${user.email}`),
                api.get(`/api/admin/retention?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/response-time?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/error-rate?admin_email=${user.email}&days=${timeRange}`),
                api.get(`/api/admin/avg-prompts?admin_email=${user.email}&days=${timeRange}`)
            ]);

            setAdminStats({
                daily: statsRes.data.daily_stats,
                dau: dauRes.data,
                newUsers: newUsersRes.data,
                prompts: promptsRes.data,
                tokens: tokensRes.data,
                features: featureRes.data,
                stickiness: stickinessRes.data,
                retention: retentionRes.data,
                responseTime: responseTimeRes.data,
                errorRate: errorRateRes.data,
                avgPrompts: avgPromptsRes.data
            });
            setAdminSummary(summaryRes.data);
        } catch (error) {
            console.error('Error fetching admin data:', error);
        }
    };

    useEffect(() => {
        if (user && activeTab === 'report') {
            fetchAdminStats();
        }
    }, [user, activeTab, timeRange]);

    // Auto-scroll to bottom of response
    useEffect(() => {
        if (chatMessages.length > 0 || isGenerating) {
            const scrollArea = document.querySelector('.response-scroll-area');
            if (scrollArea) {
                // Use a small delay to ensure the DOM has updated and images/content are rendered
                const timeoutId = setTimeout(() => {
                    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
                }, 100);
                return () => clearTimeout(timeoutId);
            }
        }
    }, [chatMessages, isGenerating]);

    // Track scroll position to show/hide scroll-to-bottom button
    useEffect(() => {
        const scrollArea = document.querySelector('.response-scroll-area');
        if (!scrollArea) return;

        const handleScroll = () => {
            const isNearBottom = scrollArea.scrollHeight - scrollArea.scrollTop <= scrollArea.clientHeight + 100;
            setShowScrollButton(!isNearBottom);
        };

        // Initial check
        handleScroll();

        scrollArea.addEventListener('scroll', handleScroll);
        // Also check on window resize
        window.addEventListener('resize', handleScroll);

        return () => {
            scrollArea.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleScroll);
        };
    }, [activeTab, chatMessages.length]);

    const scrollToBottom = () => {
        const scrollArea = document.querySelector('.response-scroll-area');
        if (scrollArea) {
            scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
        }
    };



    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || isGenerating) return;

        const currentInput = inputText;
        const currentType = contentType;

        // Add user message to chat
        const userMsg = { id: Date.now(), type: 'user', content: currentInput };
        setChatMessages(prev => [...prev, userMsg]);
        setInputText(''); // Clear input immediately for better UX
        setIsGenerating(true);

        try {
            setIsGenerating(true);

            // Handle PDF chat if PDF is selected
            if (selectedPdfForChat) {
                const formData = new FormData();
                formData.append('file', selectedPdfForChat.file);
                formData.append('question', currentInput);
                formData.append('user_id', user.id || user.email);

                formData.append('content_type', currentType);

                const response = await api.post('/api/pdf-chat', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (response.data.content) {
                    const aiMsgId = Date.now() + 1;
                    const aiMsg = {
                        id: aiMsgId,
                        type: 'ai',
                        content: response.data.content,
                        contentType: currentType,
                        topic: currentInput
                    };
                    setChatMessages(prev => [...prev, aiMsg]);

                    // Start Typing Effect
                    setTypingId(aiMsgId);
                    let fullText = response.data.content;
                    let currentText = "";
                    let index = 0;

                    const typeInterval = setInterval(() => {
                        if (index < fullText.length) {
                            // Type 3 characters at a time for better speed
                            index += 3;
                            currentText = fullText.slice(0, index);
                            setDisplayContent(prev => ({ ...prev, [aiMsgId]: currentText }));
                        } else {
                            clearInterval(typeInterval);
                            setTypingId(null);
                        }
                    }, 1);

                    fetchHistory();
                }
            } else {
                // Standard generation for non-PDF mode
                const response = await api.post('/api/generate', {
                    topic: currentInput,
                    content_type: currentType,
                    user_id: user.id || user.email,
                    mode: aiMode
                });

                if (response.data.content) {
                    const aiMsgId = Date.now() + 1;
                    const aiMsg = {
                        id: aiMsgId,
                        type: 'ai',
                        content: response.data.content,
                        contentType: currentType,
                        topic: currentInput
                    };
                    setChatMessages(prev => [...prev, aiMsg]);

                    // Start Typing Effect
                    setTypingId(aiMsgId);
                    let fullText = response.data.content;
                    let currentText = "";
                    let index = 0;

                    const typeInterval = setInterval(() => {
                        if (index < fullText.length) {
                            currentText += fullText[index];
                            setDisplayContent(prev => ({ ...prev, [aiMsgId]: currentText }));
                            index++;
                        } else {
                            clearInterval(typeInterval);
                            setTypingId(null);
                        }
                    }, 5); // Fast typing speed

                    fetchHistory(); // Refresh history
                }
            }

        } catch (error) {
            console.error('Generation error:', error);
            const errorData = error.response?.data;
            let errorMsg = errorData?.error;

            if (!errorMsg) {
                if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                    errorMsg = "The request timed out. The server might be starting up or busy. Please try again in 30 seconds.";
                } else if (!error.response) {
                    errorMsg = "Connection lost. Please check your internet or ensure the backend is running.";
                } else {
                    errorMsg = "Failed to generate content. Please try again.";
                }
            }

            // Special handling for history full error
            if (errorData?.history_full) {
                errorMsg = "⚠️ Your history is full! Please go to the History tab and click 'Clear All' to continue generating.";
            }

            const errAiMsg = { id: Date.now() + 1, type: 'error', content: `❌ ${errorMsg}` };
            setChatMessages(prev => [...prev, errAiMsg]);
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePdfClick = () => {
        pdfInputRef.current?.click();
    };

    const handlePdfFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Store selected PDF in state for display
            setSelectedPdfForChat({
                name: file.name,
                size: file.size,
                type: file.type,
                file: file
            });
            // Reset input
            if (pdfInputRef.current) {
                pdfInputRef.current.value = '';
            }
        }
    };

    const removePdf = () => {
        setSelectedPdfForChat(null);
    };

    const aboutFeatures = [
        { title: "AI-Powered", description: "Harness cutting-edge artificial intelligence to generate high-quality content in seconds", icon: "🤖" },
        { title: "Lightning Fast", description: "Get instant results without waiting. Our optimized algorithms deliver speed you can count on", icon: "⚡" },
        { title: "Analytics", description: "Track your usage, monitor trends, and optimize your content generation strategy", icon: "📊" },
        { title: "Secure", description: "Your data is encrypted and protected with enterprise-grade security measures", icon: "🔒" },
        { title: "Premium Quality", description: "Every piece of content is crafted with attention to detail and quality standards", icon: "💎" },
        { title: "Always Evolving", description: "We continuously improve our AI models to deliver better results every day", icon: "🚀" }
    ];

    const handleSaveDocument = async (docData) => {
        try {
            const response = await api.post('/api/documents', {
                ...docData,
                user_id: user.id || user.email
            });
            if (response.data.status === 'success') {
                fetchDocuments(); // Refresh the documents list
                setIsDocModalOpen(false);
            }
        } catch (error) {
            console.error('Error saving document:', error);
            alert('Failed to save document. Please try again.');
        }
    };

    return (
        <div className="dashboard-container">
            <Background3D />

            {/* Mobile Navbar */}
            <div className="mobile-navbar">
                <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                    ☰
                </button>
                <div className="brand mobile-brand">
                    <img src="/bg.png" alt="EduWrite" className="mobile-logo" />
                    <span className="brand-text">EduWrite AI</span>
                </div>
                <div className="mobile-nav-right">
                    <button className="mobile-menu-btn logout-mobile-btn" onClick={onLogout} title="Logout">
                        <LogOut size={20} />
                    </button>
                    <button className="mobile-menu-btn" onClick={() => setIsRightBarOpen(!isRightBarOpen)}>
                        ⚙️
                    </button>
                </div>
            </div>


            {/* Desktop Navbar */}
            <nav className="navbar desktop-only">
                <div className="nav-left">
                    <div className="brand">
                        <img src="/bg.png" alt="EduWrite" className="nav-logo" />
                        <h1 className="brand-name">EduWrite AI <span className="pro-badge">PRO</span></h1>
                    </div>
                </div>

                <div className="nav-center">
                    <div className="nav-links">
                        <button className={`nav-item ${activeTab === 'generator' ? 'active' : ''}`} onClick={() => setActiveTab('generator')}>Generator</button>
                        <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>History</button>
                        <button className={`nav-item ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>Activity</button>
                        <button className={`nav-item ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>Report</button>
                        <button className={`nav-item ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')}>About</button>
                    </div>
                </div>

                <div className="nav-right">
                    <button className="logout-button" onClick={onLogout}>
                        <span className="logout-icon">🚪</span>
                        Logout
                    </button>
                </div>
            </nav>

            {/* Left Sidebar */}
            <aside className={`sidebar left-sidebar ${isSidebarOpen ? 'mobile-open' : ''}`}>
                <button className="new-chat-btn" onClick={() => { setActiveTab('generator'); setIsSidebarOpen(false); setChatMessages([]); localStorage.removeItem('chatMessages'); setInputText(''); setDisplayContent({}); }}>
                    New Chat
                </button>

                <div className="chat-history-container">
                    <h3 className="sidebar-label">Chat History</h3>
                    <div className="chat-history">
                        {historyItems.length > 0 ? historyItems.map((item) => (
                            <div key={item.id} className={`history-item ${chatMessages[0]?.id === `user-${item.id}` ? 'active' : ''}`} onClick={() => {
                                setChatMessages([
                                    { id: `hist-user-${item.id}`, type: 'user', content: item.topic },
                                    { id: `hist-ai-${item.id}`, type: 'ai', content: item.response, topic: item.topic, contentType: item.content_type }
                                ]);
                                setIsSidebarOpen(false);
                                setActiveTab('generator');
                            }}>
                                <span className="icon">📜</span>
                                <span className="history-text">{item.topic || item.title}</span>
                            </div>
                        )) : (
                            <div className="history-item empty">No history yet</div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content" onClick={() => { setIsSidebarOpen(false); setIsRightBarOpen(false); }}>
                <div className="tab-content-wrapper">
                    {activeTab === 'generator' ? (
                        <div className="generator-container">
                            <div className="response-scroll-area">
                                {chatMessages.length === 0 ? (
                                    <div className="welcome-center">
                                        <h2>Welcome, <span>{user.name || user.email.split('@')[0]}</span></h2>
                                        <p>Ask anything to generate <span className="cyan-text">{contentType}</span> with AI</p>
                                        <div className="suggestion-chips">
                                            {['Write a short story', 'Solve a math problem', 'Explain Quantum Physics', 'Create a study plan'].map(suggestion => (
                                                <button key={suggestion} className="suggestion-chip" onClick={() => { setInputText(suggestion); }}>
                                                    {suggestion}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="chat-sequence">
                                        {chatMessages.map((msg) => (
                                            <div key={msg.id} className={`message-item ${msg.type}`}>
                                                {msg.type === 'user' ? (
                                                    <div className="user-query-bubble">
                                                        <span className="user-icon">👤</span>
                                                        <p>{msg.content}</p>
                                                    </div>
                                                ) : msg.type === 'error' ? (
                                                    <div className="error-display">{msg.content}</div>
                                                ) : (
                                                    <div className="ai-message-wrapper">
                                                        <div className="ai-avatar-circle">🤖</div>
                                                        <div className="response-display chat-ai-response">
                                                            <div className="response-header">
                                                                <span className="type-badge">{msg.contentType}</span>
                                                                <h3 className="topic-title">{msg.topic}</h3>
                                                            </div>
                                                            <div className="response-body markdown-content">
                                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                                    {displayContent[msg.id] || msg.content}
                                                                </ReactMarkdown>
                                                                {typingId === msg.id && <span className="typing-cursor">|</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {isGenerating && (
                                            <div className="ai-loading-indicator">
                                                <LoadingIndicator size={120} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {showScrollButton && (
                                <button
                                    className="scroll-down-btn"
                                    onClick={scrollToBottom}
                                    title="Scroll to bottom"
                                >
                                    <ChevronDown size={24} />
                                </button>
                            )}
                        </div>
                    ) : activeTab === 'history' ? (
                        <div className="response-scroll-area">
                            <div className="section-header-flex">
                                <h2 className="section-title">Generation History</h2>
                                {historyItems.length > 0 && (
                                    <button className="clear-btn" onClick={async () => {
                                        try {
                                            await api.post('/api/history/clear', { user_id: user.id || user.email });
                                        } catch (e) { console.error('Error clearing history:', e); }
                                        setChatMessages([]);
                                        setHistoryItems([]);
                                        localStorage.removeItem('chatMessages');
                                    }}>Clear All</button>
                                )}
                            </div>
                            {historyItems.length > 0 ? (
                                <div className="history-grid">
                                    {historyItems.map((item) => (
                                        <div key={item.id} className="history-card" onClick={() => {
                                            setChatMessages([
                                                { id: `hist-user-${item.id}`, type: 'user', content: item.topic },
                                                { id: `hist-ai-${item.id}`, type: 'ai', content: item.response, topic: item.topic, contentType: item.content_type }
                                            ]);
                                            setActiveTab('generator');
                                        }}>
                                            <div className="history-card-header">
                                                <span className="type-badge">{item.content_type}</span>
                                                <span className="history-card-date">{new Date(item.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <div className="history-card-topic">{item.topic}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <span>📊</span>
                                    <p>Your history is empty. Start generating!</p>
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'activity' ? (
                        <div className="response-scroll-area">
                            <h2 className="section-title">Your Activity</h2>
                            <div className="activity-stats">
                                <div className="stat-card">
                                    <div className="stat-value">{historyItems.length}</div>
                                    <div className="stat-label">Total Generations</div>
                                </div>
                                {true && (
                                    <div className="admin-stats-container">
                                        <div className="admin-header">
                                            <h3 className="admin-stats-title">Daily User Logins</h3>
                                            <button onClick={fetchAdminStats} className="refresh-btn">🔄 Refresh</button>
                                        </div>
                                        {adminStats?.daily && adminStats.daily.length > 0 ? (
                                            <div className="admin-stats-list">
                                                {adminStats.daily.map((stat, idx) => (
                                                    <div key={idx} className="admin-stat-row">
                                                        <span className="stat-day">{new Date(stat.day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                                                        <span className="stat-count">{stat.totalLogins} logins ({stat.uniqueUsers} unique)</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="loading-text">{adminStats ? "No records found." : "Loading admin statistics..."}</p>
                                        )}
                                    </div>
                                )}
                                <div className="stat-card">
                                    <div className="stat-value">Active</div>
                                    <div className="stat-label">Account Status</div>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'report' ? (
                        <div className="response-scroll-area">
                            <div className="admin-dashboard-wrapper">
                                <header className="admin-dashboard-header">
                                    <div className="header-left">
                                        <h2 className="section-title">Admin Command Center</h2>
                                        <p className="section-subtitle">Real-time analytics & SaaS metrics</p>
                                    </div>
                                    <div className="header-right">
                                        <div className="time-filter">
                                            {['7', '30', '90'].map(range => (
                                                <button
                                                    key={range}
                                                    className={`filter-btn ${timeRange === range ? 'active' : ''}`}
                                                    onClick={() => setTimeRange(range)}
                                                >
                                                    {range}D
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={fetchAdminStats} className="refresh-btn-glow">
                                            <ActivityIcon size={16} /> Refresh
                                        </button>
                                    </div>
                                </header>

                                {/* KPI Cards */}
                                <div className="kpi-grid">
                                    <div className="kpi-card">
                                        <div className="kpi-icon users"><Users size={24} /></div>
                                        <div className="kpi-info">
                                            <span className="kpi-label">Total Users</span>
                                            <h3 className="kpi-value">{adminSummary?.totalUsers || 0}</h3>
                                        </div>
                                    </div>
                                    <div className="kpi-card">
                                        <div className="kpi-icon active-users"><ActivityIcon size={24} /></div>
                                        <div className="kpi-info">
                                            <span className="kpi-label">Active Today</span>
                                            <h3 className="kpi-value">{adminSummary?.activeUsersToday || 0}</h3>
                                        </div>
                                    </div>
                                    <div className="kpi-card">
                                        <div className="kpi-icon prompts"><TrendingUp size={24} /></div>
                                        <div className="kpi-info">
                                            <span className="kpi-label">Total Prompts</span>
                                            <h3 className="kpi-value">{adminSummary?.totalPrompts || 0}</h3>
                                        </div>
                                    </div>
                                    <div className="kpi-card cost-card">
                                        <div className="kpi-info">
                                            <span className="kpi-label">Est. AI Cost</span>
                                            <h3 className="kpi-value text-gradient-cyan">${adminSummary?.estimatedCost || 0}</h3>
                                        </div>
                                    </div>
                                </div>

                                {/* Analytics Sections */}
                                <div className="analytics-layout">
                                    <div className="admin-section">
                                        <h4 className="admin-section-title">User Growth & Acquisition</h4>
                                        <div className="charts-grid-3">
                                            <div className="chart-card-premium">
                                                <h5>Daily Active Users (DAU)</h5>
                                                <div className="chart-container-sm">
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <LineChart data={adminStats?.dau}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                            <XAxis dataKey="date" hide />
                                                            <YAxis hide />
                                                            <Tooltip contentStyle={{ background: '#071c2b', border: '1px solid #00d2ff' }} />
                                                            <Line type="monotone" dataKey="value" stroke="#00d2ff" strokeWidth={3} dot={false} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                            <div className="chart-card-premium">
                                                <h5>New Users Per Day</h5>
                                                <div className="chart-container-sm">
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <LineChart data={adminStats?.newUsers}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                            <XAxis dataKey="date" hide />
                                                            <YAxis hide />
                                                            <Tooltip contentStyle={{ background: '#071c2b', border: '1px solid #34d399' }} />
                                                            <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={3} dot={true} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                            <div className="chart-card-premium">
                                                <h5>Retention Rate (%)</h5>
                                                <div className="chart-container-sm">
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <LineChart data={adminStats?.retention}>
                                                            <XAxis dataKey="date" hide />
                                                            <YAxis hide />
                                                            <Tooltip contentStyle={{ background: '#071c2b', border: '1px solid #fbbf24' }} />
                                                            <Line type="monotone" dataKey="value" stroke="#fbbf24" strokeWidth={3} dot={false} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="admin-section">
                                        <h4 className="admin-section-title">AI Usage & Engagement</h4>
                                        <div className="charts-grid-3">
                                            <div className="chart-card-premium">
                                                <h5>Prompts Per Day</h5>
                                                <div className="chart-container-sm">
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <AreaChart data={adminStats?.prompts}>
                                                            <defs>
                                                                <linearGradient id="colorPrompts" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                                                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                                                </linearGradient>
                                                            </defs>
                                                            <XAxis dataKey="date" hide />
                                                            <YAxis hide />
                                                            <Tooltip contentStyle={{ background: '#071c2b', border: '1px solid #8884d8' }} />
                                                            <Area type="monotone" dataKey="value" stroke="#8884d8" fillOpacity={1} fill="url(#colorPrompts)" />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                            <div className="chart-card-premium">
                                                <h5>Avg Prompts Per User</h5>
                                                <div className="chart-container-sm">
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <LineChart data={adminStats?.avgPrompts}>
                                                            <XAxis dataKey="date" hide />
                                                            <YAxis hide />
                                                            <Tooltip contentStyle={{ background: '#071c2b', border: '1px solid #00f2fe' }} />
                                                            <Line type="monotone" dataKey="value" stroke="#00f2fe" strokeWidth={3} dot={false} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                            <div className="chart-card-premium">
                                                <h5>Feature Distribution</h5>
                                                <div className="chart-container-sm">
                                                    <ResponsiveContainer width="100%" height={200}>
                                                        <AreaChart data={adminStats?.features}>
                                                            <XAxis dataKey="name" hide />
                                                            <YAxis hide />
                                                            <Tooltip />
                                                            <Area type="monotone" dataKey="value" stroke="#34d399" fill="#34d399" fillOpacity={0.2} />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="admin-section">
                                        <h4 className="admin-section-title">AI Efficiency & Infrastructure</h4>
                                        <div className="two-col-grid">
                                            <div className="chart-card-premium">
                                                <h5>Token Usage Trends</h5>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <AreaChart data={adminStats?.tokens}>
                                                        <defs>
                                                            <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#c084fc" stopOpacity={0.8} />
                                                                <stop offset="95%" stopColor="#c084fc" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="date" stroke="#8a9bb0" fontSize={10} />
                                                        <YAxis stroke="#8a9bb0" fontSize={10} />
                                                        <Tooltip />
                                                        <Area type="monotone" dataKey="value" stroke="#c084fc" fillOpacity={1} fill="url(#colorTokens)" />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="chart-card-premium">
                                                <h5>Stickiness (DAU/MAU)</h5>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <LineChart data={adminStats?.stickiness}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="date" stroke="#8a9bb0" fontSize={10} />
                                                        <YAxis stroke="#8a9bb0" fontSize={10} />
                                                        <Tooltip />
                                                        <Line type="monotone" dataKey="value" stroke="#ff5722" strokeWidth={3} dot={false} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="admin-section">
                                        <h4 className="admin-section-title">System Health & Latency</h4>
                                        <div className="two-col-grid">
                                            <div className="chart-card-premium">
                                                <h5>API Response Latency (ms)</h5>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <LineChart data={adminStats?.responseTime}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="date" stroke="#8a9bb0" fontSize={10} />
                                                        <YAxis stroke="#8a9bb0" fontSize={10} />
                                                        <Tooltip />
                                                        <Line type="monotone" dataKey="value" stroke="#00f2fe" strokeWidth={2} dot={true} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="chart-card-premium error-chart">
                                                <h5>Global Error Rate (%)</h5>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <AreaChart data={adminStats?.errorRate}>
                                                        <XAxis dataKey="date" hide />
                                                        <YAxis hide />
                                                        <Tooltip />
                                                        <Area type="monotone" dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="admin-section">
                                        <h4 className="admin-section-title">Traffic & Content Insights</h4>
                                        <div className="two-col-grid">
                                            <div className="chart-card-premium">
                                                <h5>User Traffic: Login vs Signup</h5>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <BarChart data={adminStats?.daily}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="day" hide />
                                                        <YAxis hide />
                                                        <Tooltip contentStyle={{ background: '#071c2b', border: '1px solid #c084fc' }} />
                                                        <Legend />
                                                        <Bar dataKey="totalLogins" name="Logins" fill="#c084fc" radius={[4, 4, 0, 0]} />
                                                        <Bar dataKey="uniqueUsers" name="Uniques" fill="#00f2fe" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="chart-card-premium">
                                                <h5>Top Performing Categories</h5>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <BarChart data={adminStats?.features} layout="vertical">
                                                        <XAxis type="number" hide />
                                                        <YAxis dataKey="name" type="category" stroke="#8a9bb0" fontSize={10} width={80} />
                                                        <Tooltip />
                                                        <Bar dataKey="value" fill="#34d399" radius={[0, 4, 4, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'about' ? (
                        <div className="about-container">
                            <div className="about-header">
                                <h2 className="greeting-text">Hello, <span className="cyan-text">{user.name || user.email.split('@')[0]}!</span></h2>
                                <h1 style={{ marginBottom: "0.5rem" }}>About <span className="cyan-text">Edu Write</span></h1>
                                <p className="subtitle-brand" style={{ fontSize: "1.4rem", fontWeight: "600", color: "#fff", letterSpacing: "1px", marginBottom: "0.8rem" }}>
                                    A Text Generation Based Application
                                </p>
                                <p className="subtitle-brand">Powered by Groq AI</p>
                                <p className="tagline">Transforming Education with <span className="purple-text">Intelligent Content Generation</span></p>
                            </div>
                            <h2 className="section-title">Why Choose Edu Write?</h2>
                            <div className="features-grid">
                                <div className="groq-branding-section feature-card">
                                    <div className="feature-icon groq-logo-container">
                                        <img src="/groq-logo.png" alt="Groq" className="groq-logo-img" />
                                    </div>
                                    <div className="feature-info">
                                        <h3>Powered by Groq</h3>
                                        <p className="groq-text">Built with Groq’s lightning-fast AI engine for academic assistance.</p>
                                    </div>
                                </div>
                                {aboutFeatures.map((feature, index) => (
                                    <div key={index} className="feature-card">
                                        <div className="feature-icon">{feature.icon}</div>
                                        <div className="feature-info"><h3>{feature.title}</h3><p>{feature.description}</p></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>

                {
                    activeTab !== 'about' && (
                        <div className="input-section-bottom">
                            <div className="input-container">
                                <form onSubmit={handleGenerate} className="chat-input-wrapper" style={{ position: 'relative' }}>
                                    <div className="input-action-container">
                                        <button
                                            type="button"
                                            className={`input-action-btn ${isActionMenuOpen ? 'active' : ''}`}
                                            onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                                        >
                                            <span className="plus-icon">+</span>
                                        </button>

                                        {isActionMenuOpen && (
                                            <div className="input-action-menu">
                                                {actionMenuItems
                                                    .filter(item => !item.visibleFor || item.visibleFor.includes(contentType))
                                                    .map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`action-menu-item ${aiMode === item.mode ? 'active' : ''}`}
                                                            onClick={() => {
                                                                if (item.mode === 'pdf') {
                                                                    handlePdfClick();
                                                                } else {
                                                                    setAiMode(item.mode);
                                                                }
                                                                setIsActionMenuOpen(false);
                                                            }}
                                                        >
                                                            <span className="action-icon">{item.icon}</span>
                                                            <span className="action-label">{item.label}</span>
                                                            {aiMode === item.mode && item.mode !== 'upload' && <span className="active-dot"></span>}
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>

                                    {selectedPdfForChat && (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 16px',
                                            backgroundColor: '#1a1a1a',
                                            borderRadius: '8px',
                                            marginBottom: '12px',
                                            border: '1px solid #333'
                                        }}>
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '8px',
                                                backgroundColor: '#ff5555',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '20px'
                                            }}>📄</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontWeight: '500',
                                                    color: '#fff',
                                                    fontSize: '14px',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {selectedPdfForChat.name}
                                                </div>
                                                <div style={{
                                                    fontSize: '12px',
                                                    color: '#888',
                                                    marginTop: '2px'
                                                }}>
                                                    PDF
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={removePdf}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#888',
                                                    cursor: 'pointer',
                                                    fontSize: '20px',
                                                    padding: '4px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'color 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.target.style.color = '#fff'}
                                                onMouseLeave={(e) => e.target.style.color = '#888'}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}

                                    {/* PDF upload input removed - now opens Streamlit app in browser */}
                                    <input
                                        ref={pdfInputRef}
                                        type="file"
                                        accept=".pdf"
                                        onChange={handlePdfFileSelect}
                                        style={{ display: 'none' }}
                                    />

                                    <input
                                        type="text"
                                        className="chat-input"
                                        placeholder={`Ask about something for ${contentType}...`}
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        disabled={isGenerating}
                                    />
                                    <button type="submit" className="send-btn" disabled={isGenerating || !inputText.trim()}>
                                        {isGenerating ? <div className="loader-small"></div> : <span className="send-icon">→</span>}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }
            </main>

            {/* Right Sidebar */}
            <aside className={`right-bar ${isRightBarOpen ? 'open' : ''}`}>
                <div className="sidebar-section">
                    <h3 className="sidebar-label">CONTENT TYPES</h3>
                    {Object.entries(categorizedContentTypes).map(([key, category]) => (
                        <div className={`category-wrapper category-${key} ${openCategories[key] ? 'open' : ''}`} key={key}>
                            <div className="category-header smaller" onClick={() => toggleCategory(key)}>
                                <span>{category.icon} {category.label}</span>
                                <span className={`chevron ${openCategories[key] ? 'open' : ''}`}>▼</span>
                            </div>
                            <div
                                className="category-content"
                                style={{
                                    maxHeight: openCategories[key] ? `${category.types.length * 50}px` : '0',
                                    opacity: openCategories[key] ? 1 : 0,
                                    visibility: openCategories[key] ? 'visible' : 'hidden'
                                }}
                            >
                                {category.types.map(type => (
                                    <div
                                        key={type}
                                        className={`content-type-item ${contentType === type ? 'active' : ''}`}
                                        onClick={() => { setContentType(type); setActiveTab('generator'); setIsRightBarOpen(false); }}
                                    >
                                        <span className="dot"></span>
                                        {type}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            {(isSidebarOpen || isRightBarOpen) && <div className="mobile-overlay" onClick={() => { setIsSidebarOpen(false); setIsRightBarOpen(false); }}></div>}

            <DocumentModal
                isOpen={isDocModalOpen}
                onClose={() => setIsDocModalOpen(false)}
                onSave={handleSaveDocument}
            />
        </div>
    );
};

export default Dashboard;
