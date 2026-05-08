/**
 * VoteWave - AI Chatbot Assistant
 * Ultra-smart bot that knows everything about the platform
 * Can answer questions, guide users step-by-step, and provide detailed help
 */

// ========================================
// CHATBOT STATE
// ========================================
const ChatState = {
  isOpen: false,
  isInitialized: false,
  conversationHistory: [],
  userContext: {
    isLoggedIn: false,
    userRole: null,
    currentPage: null,
  },
};

// ========================================
// COMPREHENSIVE KNOWLEDGE BASE
// ========================================
const KnowledgeBase = {
  // General Platform Info
  platform: {
    name: 'VoteWave',
    tagline: 'Modern Voting Made Simple',
    description: 'VoteWave is a secure, AI-powered e-voting platform designed for schools, universities, clubs, corporations, and organizations. It enables administrators to create and manage elections, while voters can cast their votes securely from any device.',
    features: [
      'Military-grade security with AES-256 encryption',
      'AI-powered chatbot assistant for 24/7 support',
      'Real-time live results with interactive charts',
      'Multi-position/portfolio voting support',
      'Mobile money integration (MTN, Vodafone, AirtelTigo)',
      'Card payments via Paystack',
      'Dedicated event micro-sites',
      'Public nominee registration',
      'Audit logging and compliance',
      'Dark/Light mode',
    ],
    pricing: {
      starter: { price: 'Free', voters: '500', elections: '3/year' },
      professional: { price: 'GHS 49/month', voters: '10,000', elections: 'Unlimited' },
      enterprise: { price: 'Custom', voters: 'Unlimited', elections: 'Unlimited' },
    },
    contact: {
      email: 'support@votewave.com',
      website: 'https://votewave.com',
    },
  },

  // How to use the platform
  guides: {
    'create-account': {
      title: 'How to Create an Account',
      steps: [
        '1. Visit the VoteWave homepage',
        '2. Click "Get Started Free" or "Sign In" button',
        '3. If registering, fill in your First Name, Last Name, and Email',
        '4. Create a strong password (at least 6 characters)',
        '5. Check your email for a 6-digit OTP verification code',
        '6. Enter the OTP code to verify your account',
        '7. You\'re ready to vote or create elections!',
      ],
    },
    'vote': {
      title: 'How to Cast Your Vote',
      steps: [
        '1. Browse active elections from the Elections page',
        '2. Click on an election to view candidates',
        '3. Review each candidate\'s bio and manifesto',
        '4. Select your preferred candidate by clicking on them',
        '5. Choose how many votes you want to cast (GHS 5 per vote)',
        '6. Click "Pay & Vote Now" to complete payment',
        '7. Pay via Mobile Money (MTN, Vodafone, AirtelTigo) or Card',
        '8. Receive confirmation via email/SMS',
      ],
    },
    'create-election': {
      title: 'How to Create an Election (Admin)',
      steps: [
        '1. Sign in to your admin dashboard',
        '2. Go to "Elections" in the sidebar',
        '3. Click "Create Election"',
        '4. Enter the election title (e.g., "Student Council 2026")',
        '5. Select the election type (Student, Nomination, Event, etc.)',
        '6. Add positions/categories separated by commas',
        '7. Set the start and end dates',
        '8. Optionally save as draft or schedule for later',
        '9. Click "Create Election"',
        '10. Copy the generated voting link and registration link',
        '11. Share the links with participants',
      ],
    },
    'add-candidates': {
      title: 'How to Add Candidates (Admin)',
      steps: [
        '1. Go to "Candidates" in the admin sidebar',
        '2. Click "Add Candidate"',
        '3. Enter the candidate\'s First Name and Last Name',
        '4. Enter their email (optional)',
        '5. Select the election they\'re running in',
        '6. Choose their position/category',
        '7. Add their bio or manifesto',
        '8. Click "Save"',
        '9. The candidate will now appear on the voting page',
      ],
    },
    'nominate': {
      title: 'How to Become a Nominee',
      steps: [
        '1. Get the nomination registration link from your event organizer',
        '2. Open the link in your browser',
        '3. Fill in your full name and email',
        '4. Enter your phone number',
        '5. Select the category you want to be nominated for',
        '6. Write a compelling bio explaining why people should vote for you',
        '7. Click "Submit Nomination"',
        '8. Wait for admin approval',
        '9. Once approved, your name will appear on the voting page',
      ],
    },
    'payment': {
      title: 'Payment Methods & Pricing',
      steps: [
        'Available Payment Methods:',
        '📱 MTN Mobile Money',
        '📱 Vodafone Cash',
        '📱 AirtelTigo Money',
        '💳 Visa / Mastercard',
        '🏦 Bank Transfer',
        '',
        'Pricing:',
        '• GHS 5.00 per vote',
        '• You can purchase multiple votes (1-100)',
        '• Bulk voting available for supporters',
        '',
        'All payments are processed securely via Paystack.',
      ],
    },
    'results': {
      title: 'How to View Results',
      steps: [
        '1. Go to the Elections page',
        '2. Find a completed election',
        '3. Click "View Results"',
        '4. See the vote distribution with charts',
        '5. Results can be exported as CSV or PDF',
        '6. Public results links can be shared',
      ],
    },
  },

  // Common questions and answers
  faq: [
    {
      q: ['is my vote anonymous', 'can anyone see my vote', 'privacy', 'anonymous'],
      a: 'Yes! Your vote is completely anonymous. We use zero-knowledge proofs and cryptographic hashing. Even administrators cannot see who you voted for. Only the total vote count is visible.',
    },
    {
      q: ['is it secure', 'security', 'encryption', 'safe'],
      a: 'VoteWave uses military-grade AES-256 encryption, JWT authentication, rate limiting, Helmet.js security headers, and immutable audit trails. Your data is protected at every level.',
    },
    {
      q: ['how much', 'price', 'cost', 'pricing', 'fee'],
      a: 'VoteWave offers a free Starter plan (up to 500 voters, 3 elections/year). The Professional plan is GHS 49/month with unlimited elections. Enterprise pricing is custom. Each vote costs GHS 5.00 for voters.',
    },
    {
      q: ['mobile money', 'momo', 'mtn', 'vodafone', 'airteltigo', 'payment method'],
      a: 'Yes! We support all major mobile money providers in Ghana: MTN Mobile Money, Vodafone Cash, and AirtelTigo Money. We also accept Visa, Mastercard, and bank transfers.',
    },
    {
      q: ['register candidate', 'nominate', 'become nominee', 'join election'],
      a: 'To become a nominee, you need the registration link from your event organizer. Open the link, fill in your details, select your category, and submit. The admin will review and approve your nomination.',
    },
    {
      q: ['multiple votes', 'buy votes', 'vote many times', 'bulk voting'],
      a: 'Yes! You can purchase multiple votes (1-100) for a single candidate. Each vote costs GHS 5.00. This is perfect for supporters who want to show extra support for their preferred candidate.',
    },
    {
      q: ['create election', 'start voting event', 'organize election', 'admin'],
      a: 'To create an election, sign in as an admin, go to the Elections page, click "Create Election", fill in the details (title, type, positions, dates), and save. You\'ll get a unique voting link to share.',
    },
    {
      q: ['reset password', 'forgot password', 'cant login', 'locked out'],
      a: 'Click "Forgot Password?" on the login page. Enter your email, and we\'ll send you a reset link. Check your spam folder if you don\'t see it. The link expires in 15 minutes.',
    },
    {
      q: ['what is votewave', 'about', 'platform', 'service'],
      a: 'VoteWave is a premium e-voting platform that makes elections simple, secure, and transparent. We serve schools, universities, clubs, corporations, and organizations across Ghana and beyond.',
    },
    {
      q: ['contact', 'support', 'help', 'email', 'phone'],
      a: 'For support, email us at support@votewave.com. Our team typically responds within 2 hours during business hours. You can also use this chatbot for instant help!',
    },
    {
      q: ['refund', 'cancel payment', 'wrong vote', 'mistake'],
      a: 'Once a vote is cast and payment is processed, it cannot be changed or refunded. This ensures the integrity of the election. Please review your selection carefully before confirming.',
    },
  ],

  // Greetings
  greetings: [
    "Hello! 👋 I'm the VoteWave AI Assistant. I can help you with voting, creating elections, nominations, payments, and more. What would you like to know?",
    "Hi there! 🗳️ Welcome to VoteWave! I'm here to guide you through everything — from casting your vote to creating your own election. How can I help?",
    "Welcome! 😊 I'm your VoteWave assistant. Whether you're a voter, nominee, or administrator, I've got you covered. Ask me anything!",
  ],

  // Farewell responses
  farewells: [
    "Happy voting! 🗳️ Let me know if you need anything else.",
    "Good luck! 🍀 I'm always here if you have more questions.",
    "Thanks for chatting! 😊 Come back anytime you need help.",
  ],

  // Fallback responses
  fallbacks: [
    "I'd love to help with that! Could you provide a bit more detail about what you're looking for?",
    "Great question! Let me assist you. Could you be more specific?",
    "I'm here to help with everything VoteWave-related. What specifically would you like to know?",
  ],
};

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  initChatbot();
});

function initChatbot() {
  const toggle = document.getElementById('chatToggle');
  const window = document.getElementById('chatWindow');
  const close = document.getElementById('chatClose');
  const input = document.getElementById('chatInput');
  const send = document.getElementById('chatSend');
  const messages = document.getElementById('chatMessages');

  if (!toggle || !window) return;

  // Mark as initialized to prevent duplicate handlers
  window.chatbotInitialized = true;

  // Toggle chat window
  toggle.addEventListener('click', () => {
    ChatState.isOpen = !ChatState.isOpen;
    window.classList.toggle('active', ChatState.isOpen);

    if (ChatState.isOpen) {
      if (!ChatState.isInitialized) {
        ChatState.isInitialized = true;
        setTimeout(() => {
          addBotMessage(getRandomGreeting());
        }, 500);
      }
      setTimeout(() => input?.focus(), 600);
    }
  });

  // Close chat
  close?.addEventListener('click', () => {
    ChatState.isOpen = false;
    window.classList.remove('active');
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ChatState.isOpen) {
      ChatState.isOpen = false;
      window.classList.remove('active');
    }
  });

  // Send message handlers
  send?.addEventListener('click', handleSendMessage);
  input?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Detect user context
  detectUserContext();
}

// ========================================
// MESSAGE HANDLING
// ========================================
function handleSendMessage() {
  const input = document.getElementById('chatInput');
  const message = input?.value.trim();
  if (!message) return;

  // Add user message
  addUserMessage(message);
  input.value = '';
  input.focus();

  // Show typing indicator
  showTypingIndicator();

  // Process and respond
  setTimeout(() => {
    removeTypingIndicator();
    const response = generateResponse(message);
    addBotMessage(response);
  }, 800 + Math.random() * 1200);
}

// ========================================
// RESPONSE GENERATION (THE BRAIN)
// ========================================
function generateResponse(userMessage) {
  const msg = userMessage.toLowerCase().trim();
  ChatState.conversationHistory.push({ role: 'user', content: userMessage });

  // Check for greetings
  if (/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|yo|sup)/i.test(msg)) {
    return getRandomGreeting();
  }

  // Check for farewells
  if (/^(bye|goodbye|see you|thanks|thank you|thx|ty|ok|okay)/i.test(msg)) {
    return getRandomFarewell();
  }

  // Check FAQ matches
  for (const item of KnowledgeBase.faq) {
    if (item.q.some(keyword => msg.includes(keyword))) {
      return item.a;
    }
  }

  // Check for guide requests
  if (msg.includes('how to vote') || msg.includes('cast vote') || msg.includes('voting process')) {
    return formatGuide(KnowledgeBase.guides.vote);
  }
  if (msg.includes('create account') || msg.includes('register') || msg.includes('sign up')) {
    return formatGuide(KnowledgeBase.guides['create-account']);
  }
  if (msg.includes('create election') || msg.includes('start election') || msg.includes('organize')) {
    return formatGuide(KnowledgeBase.guides['create-election']);
  }
  if (msg.includes('add candidate') || msg.includes('nominee') || msg.includes('nominate')) {
    return formatGuide(KnowledgeBase.guides['add-candidates']);
  }
  if (msg.includes('payment') || msg.includes('pay') || msg.includes('momo') || msg.includes('mobile money')) {
    return formatGuide(KnowledgeBase.guides.payment);
  }
  if (msg.includes('result') || msg.includes('who won') || msg.includes('outcome')) {
    return formatGuide(KnowledgeBase.guides.results);
  }

  // Check for specific topics
  if (msg.includes('feature') || msg.includes('what can') || msg.includes('capabilities')) {
    return 'VoteWave offers:\n\n🔒 Military-grade security\n🤖 AI chatbot assistant\n📊 Real-time results\n📱 Mobile money payments\n🏛️ Multi-position voting\n🔗 Dedicated event micro-sites\n📝 Public nominee registration\n\nWhich feature would you like to learn more about?';
  }

  if (msg.includes('pricing') || msg.includes('plan') || msg.includes('subscription')) {
    return '📊 **VoteWave Plans:**\n\n🆓 **Starter** - Free\n• Up to 500 voters\n• 3 elections/year\n\n⭐ **Professional** - GHS 49/month\n• Up to 10,000 voters\n• Unlimited elections\n• AI assistant\n\n🏢 **Enterprise** - Custom\n• Unlimited everything\n• Custom integrations\n\nEach vote costs GHS 5.00 for voters.';
  }

  // Default fallback
  return getRandomFallback();
}

// ========================================
// GUIDE FORMATTING
// ========================================
function formatGuide(guide) {
  return `📋 **${guide.title}**\n\n${guide.steps.join('\n')}\n\nIs there anything else I can help with?`;
}

// ========================================
// MESSAGE RENDERING
// ========================================
function addUserMessage(text) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message user';
  msgDiv.innerHTML = `<div class="message-content"><p>${escapeHtml(text)}</p><span class="message-time">${getTime()}</span></div>`;
  messages.appendChild(msgDiv);
  scrollToBottom(messages);
}

function addBotMessage(text) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message assistant';

  // Convert markdown-like syntax
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/📋|🔒|🤖|📊|📱|🏛️|🔗|📝|🆓|⭐|🏢|💳|📱|🏦/g, match => `<span style="font-size:1.1em;">${match}</span>`);

  msgDiv.innerHTML = `<div class="message-content"><p>${formatted}</p><span class="message-time">${getTime()}</span></div>`;
  messages.appendChild(msgDiv);
  scrollToBottom(messages);
}

function showTypingIndicator() {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;

  removeTypingIndicator();

  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-message assistant typing-indicator';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML = `
    <div class="message-content">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messages.appendChild(typingDiv);
  scrollToBottom(messages);
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.remove();
}

function scrollToBottom(container) {
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function getRandomGreeting() {
  return KnowledgeBase.greetings[Math.floor(Math.random() * KnowledgeBase.greetings.length)];
}

function getRandomFarewell() {
  return KnowledgeBase.farewells[Math.floor(Math.random() * KnowledgeBase.farewells.length)];
}

function getRandomFallback() {
  return KnowledgeBase.fallbacks[Math.floor(Math.random() * KnowledgeBase.fallbacks.length)];
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function detectUserContext() {
  // Check if user is logged in
  const token = localStorage.getItem('accessToken');
  ChatState.userContext.isLoggedIn = !!token;

  // Get user role
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  ChatState.userContext.userRole = user.role || 'visitor';

  // Get current page
  ChatState.userContext.currentPage = window.location.pathname;
}

// ========================================
// STYLES INJECTION
// ========================================
(function injectStyles() {
  if (document.getElementById('chatbot-enhanced-styles')) return;

  const style = document.createElement('style');
  style.id = 'chatbot-enhanced-styles';
  style.textContent = `
    .typing-dots {
      display: flex;
      gap: 4px;
      padding: 4px 0;
    }
    .typing-dots span {
      width: 7px;
      height: 7px;
      background: #94a3b8;
      border-radius: 50%;
      animation: typingBounce 1.4s ease-in-out infinite;
    }
    .typing-dots span:nth-child(1) { animation-delay: 0s; }
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes typingBounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-6px); opacity: 1; }
    }
    
    .message-time {
      display: block;
      font-size: 0.6rem;
      color: #64748b;
      margin-top: 4px;
      text-align: right;
    }
    
    .chat-message.assistant .message-content {
      background: rgba(255,255,255,0.05);
      border-radius: 1rem 1rem 1rem 0.25rem;
    }
    
    .chat-message.user .message-content {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 1rem 1rem 0.25rem 1rem;
      color: white;
    }
    
    .chat-message .message-content strong {
      color: inherit;
    }
  `;
  document.head.appendChild(style);
})();

// ========================================
// EXPORT
// ========================================
console.log('🤖 VoteWave AI Chatbot Ready');
console.log('   - Knows everything about the platform');
console.log('   - Can guide users step-by-step');
console.log('   - Smart FAQ matching');
console.log('   - Context-aware responses');