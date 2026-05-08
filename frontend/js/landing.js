/**
 * VoteWave - Landing Page JavaScript
 * Handles animations, interactions, and dynamic content
 * UPDATED: All functions properly organized
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize all features
  hideLoadingScreen();
  initAnimations();
  initCounterAnimation();
  initSmoothScroll();
  initNavbarScroll();
  initCarousel();
  initParticleSystem();
  initMouseSpotlight();
  initTiltCards();
  initTextScramble();
  initSearchOverlay();
  initVotingTypeCards();
  initMarqueeAnimation();
  initNewsletterForm();
  initFeatureCardHover();
});

// ─── Loading Screen ───
function hideLoadingScreen() {
  const preloader = document.getElementById('preloader');
  if (preloader) {
    setTimeout(() => {
      preloader.classList.add('hidden');
      setTimeout(() => {
        if (preloader) {
          preloader.style.display = 'none';
        }
      }, 600);
    }, 2000);
  }
}

// ─── GSAP Animations ───
function initAnimations() {
  if (typeof gsap === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  // Hero content animation
  const heroTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

  heroTimeline
    .from('.hero-badge', {
      y: 30,
      opacity: 0,
      duration: 0.6,
    })
    .from('.title-line', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
    }, '-=0.3')
    .from('.hero-subtitle', {
      y: 30,
      opacity: 0,
      duration: 0.6,
    }, '-=0.4')
    .from('.hero-actions', {
      y: 30,
      opacity: 0,
      duration: 0.6,
    }, '-=0.3')
    .from('.hero-trust', {
      y: 30,
      opacity: 0,
      duration: 0.6,
    }, '-=0.3')
    .from('.dashboard-mockup', {
      x: 100,
      opacity: 0,
      duration: 0.8,
      rotation: 5,
    }, '-=0.6')
    .from('.floating-badge', {
      x: 50,
      y: -50,
      opacity: 0,
      duration: 0.6,
      stagger: 0.2,
    }, '-=0.4');

  // Floating elements parallax on mouse move
  const heroVisual = document.querySelector('.hero-visual');
  if (heroVisual) {
    heroVisual.addEventListener('mousemove', (e) => {
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;

      const xPercent = (clientX / innerWidth - 0.5) * 2;
      const yPercent = (clientY / innerHeight - 0.5) * 2;

      gsap.to('.dashboard-mockup', {
        x: xPercent * -20,
        y: yPercent * -20,
        duration: 0.5,
        ease: 'power2.out',
      });

      gsap.to('.floating-badge', {
        x: xPercent * -30,
        y: yPercent * -30,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.1,
      });
    });

    heroVisual.addEventListener('mouseleave', () => {
      gsap.to('.dashboard-mockup, .floating-badge', {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: 'power2.out',
      });
    });
  }

  // Features section animation
  gsap.from('.features-section .section-header', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.features-section',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.8,
  });

  gsap.from('.feature-card-advanced', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.features-grid-advanced',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.6,
    stagger: 0.1,
  });

  // How it works section
  gsap.from('.how-it-works-section .section-header', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.how-it-works-section',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.8,
  });

  gsap.from('.step-item', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.steps-visual',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.6,
    stagger: 0.2,
  });

  // CTA section
  gsap.from('.cta-card', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.cta-section',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.8,
  });

  // Testimonials section
  gsap.from('.testimonials-section .section-header', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.testimonials-section',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.8,
  });

  gsap.from('.testimonial-card', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.testimonials-grid',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.6,
    stagger: 0.1,
  });

  // Pricing section
  gsap.from('.pricing-section .section-header', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.pricing-section',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.8,
  });

  gsap.from('.pricing-card', {
    immediateRender: false,
    scrollTrigger: {
      trigger: '.pricing-grid',
      start: 'top 80%',
      toggleActions: 'play none none reverse',
    },
    y: 50,
    opacity: 0,
    duration: 0.6,
    stagger: 0.1,
  });

  // Animate progress bar
  gsap.to('.progress-fill', {
    width: '73%',
    duration: 1.5,
    ease: 'power2.out',
    delay: 1,
  });
}

// ─── Counter Animation ───
function initCounterAnimation() {
  const counters = document.querySelectorAll('.quick-stat-value[data-count], .stat-value');
  
  const animateCounter = (element) => {
    const text = element.textContent;
    const hasPlus = text.includes('+');
    const hasK = text.includes('K');
    const num = parseInt(text.replace(/\D/g, ''));
    
    if (isNaN(num)) return;
    
    let current = 0;
    const increment = num / 50;
    const duration = 2000;
    const stepTime = duration / 50;

    const timer = setInterval(() => {
      current += increment;
      
      if (current >= num) {
        current = num;
        clearInterval(timer);
      }

      let display = Math.floor(current).toString();
      if (hasK) display += 'K';
      if (hasPlus) display += '+';
      
      element.textContent = display;
    }, stepTime);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => observer.observe(counter));
}

// ─── Smooth Scroll ───
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
  });
}

// ─── Navbar Scroll Effect ───
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 50) {
      navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
    } else {
      navbar.style.boxShadow = 'none';
    }

    if (currentScroll > lastScroll && currentScroll > 100) {
      navbar.style.transform = 'translateY(-100%)';
    } else {
      navbar.style.transform = 'translateY(0)';
    }

    lastScroll = currentScroll;
  });

  navbar.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
}

// ─── Feature Card Hover ───
function initFeatureCardHover() {
  document.querySelectorAll('.feature-card-advanced').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-8px)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
    });
  });
}

// ─── Particle System ───
function initParticleSystem() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  // Skip if particles.js is being used (check for #particles-js)
  if (document.getElementById('particles-js')) return;

  // Check if canvas already exists
  if (document.getElementById('particleCanvas')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'particleCanvas';
  canvas.style.cssText = 'position: absolute; inset: 0; z-index: 1; pointer-events: none;';
  hero.querySelector('.hero-background')?.appendChild(canvas) || hero.insertBefore(canvas, hero.firstChild);

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animationId;
  let isActive = true;

  function resize() {
    canvas.width = hero.offsetWidth;
    canvas.height = hero.offsetHeight;
  }

  class Particle {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 3 + 1;
      this.speedX = (Math.random() - 0.5) * 0.5;
      this.speedY = (Math.random() - 0.5) * 0.5;
      this.opacity = Math.random() * 0.5 + 0.2;
      this.color = Math.random() > 0.5 ? '#6366f1' : '#8b5cf6';
    }

    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
      if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.opacity;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function init() {
    resize();
    particles = [];
    const particleCount = Math.min(50, Math.floor((canvas.width * canvas.height) / 15000));
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
  }

  function connectParticles() {
    const maxDistance = 100;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < maxDistance) {
          ctx.beginPath();
          ctx.strokeStyle = '#6366f1';
          ctx.globalAlpha = (1 - distance / maxDistance) * 0.2;
          ctx.lineWidth = 1;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function animate() {
    if (!isActive) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(particle => {
      particle.update();
      particle.draw();
    });
    connectParticles();
    animationId = requestAnimationFrame(animate);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isActive = entry.isIntersecting;
      if (isActive) {
        animate();
      } else {
        cancelAnimationFrame(animationId);
      }
    });
  }, { threshold: 0.1 });

  observer.observe(hero);

  window.addEventListener('resize', () => {
    resize();
    init();
  });

  init();
  animate();
}

// ─── Mouse Spotlight Effect ───
function initMouseSpotlight() {
  const hero = document.querySelector('.hero');
  if (!hero) return;

  // Check if spotlight already exists
  if (hero.querySelector('.spotlight')) return;

  const spotlight = document.createElement('div');
  spotlight.className = 'spotlight';
  spotlight.style.cssText = `
    position: absolute;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    opacity: 0;
    transition: opacity 0.3s ease;
    transform: translate(-50%, -50%);
  `;
  hero.appendChild(spotlight);

  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spotlight.style.left = x + 'px';
    spotlight.style.top = y + 'px';
    spotlight.style.opacity = '1';
  });

  hero.addEventListener('mouseleave', () => {
    spotlight.style.opacity = '0';
  });
}

// ─── 3D Tilt Cards ───
function initTiltCards() {
  const cards = document.querySelectorAll('.feature-card-advanced');
  
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = (y - centerY) / 20;
      const rotateY = (centerX - x) / 20;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px) scale(1.02)`;
      card.style.transition = 'transform 0.1s ease';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0) scale(1)';
      card.style.transition = 'transform 0.3s ease';
    });
  });
}

// ─── Text Scramble Effect ───
function initTextScramble() {
  const chars = '!<>-_\\/[]{}—=+*^?#________';
  
  class TextScramble {
    constructor(el) {
      this.el = el;
      this.chars = chars;
      this.update = this.update.bind(this);
    }
    
    setText(newText) {
      const oldText = this.el.innerText;
      const length = Math.max(oldText.length, newText.length);
      const promise = new Promise((resolve) => this.resolve = resolve);
      this.queue = [];
      
      for (let i = 0; i < length; i++) {
        const from = oldText[i] || '';
        const to = newText[i] || '';
        const start = Math.floor(Math.random() * 40);
        const end = start + Math.floor(Math.random() * 40);
        this.queue.push({ from, to, start, end });
      }
      
      cancelAnimationFrame(this.frameRequest);
      this.frame = 0;
      this.update();
      return promise;
    }
    
    update() {
      let output = '';
      let complete = 0;
      
      for (let i = 0, n = this.queue.length; i < n; i++) {
        let { from, to, start, end, char } = this.queue[i];
        
        if (this.frame >= end) {
          complete++;
          output += to;
        } else if (this.frame >= start) {
          if (!char || Math.random() < 0.28) {
            char = this.randomChar();
            this.queue[i].char = char;
          }
          output += `<span style="color: var(--primary-500)">${char}</span>`;
        } else {
          output += from;
        }
      }
      
      this.el.innerHTML = output;
      
      if (complete === this.queue.length) {
        this.resolve();
      } else {
        this.frameRequest = requestAnimationFrame(this.update);
        this.frame++;
      }
    }
    
    randomChar() {
      return this.chars[Math.floor(Math.random() * this.chars.length)];
    }
  }
  
  document.querySelectorAll('.section-title').forEach(title => {
    const originalText = title.innerText;
    const fx = new TextScramble(title);
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          fx.setText(originalText);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    
    observer.observe(title);
  });
}

// ─── Events Carousel ───
function initCarousel() {
  const track = document.getElementById('carouselTrack');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  const dotsContainer = document.getElementById('carouselDots');
  
  if (!track || !dotsContainer) return;
  
  const slides = track.querySelectorAll('.carousel-slide');
  if (slides.length === 0) return;
  
  const slideWidth = 350 + 24; // slide width + gap
  let currentIndex = 0;
  
  // Create dots
  dotsContainer.innerHTML = '';
  slides.forEach((_, index) => {
    const dot = document.createElement('button');
    dot.className = `carousel-dot ${index === 0 ? 'active' : ''}`;
    dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer.appendChild(dot);
  });
  
  const dots = dotsContainer.querySelectorAll('.carousel-dot');
  
  function goToSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    
    currentIndex = index;
    track.scrollTo({
      left: index * slideWidth,
      behavior: 'smooth'
    });
    
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
    });
  }
  
  prevBtn?.addEventListener('click', () => goToSlide(currentIndex - 1));
  nextBtn?.addEventListener('click', () => goToSlide(currentIndex + 1));
  
  // Update current index on scroll
  track.addEventListener('scroll', () => {
    const newIndex = Math.round(track.scrollLeft / slideWidth);
    if (newIndex !== currentIndex) {
      currentIndex = newIndex;
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
      });
    }
  });
  
  // Auto-scroll
  let autoScroll = setInterval(() => {
    const newIndex = (currentIndex + 1) % slides.length;
    goToSlide(newIndex);
  }, 5000);
  
  // Pause on hover
  track.addEventListener('mouseenter', () => clearInterval(autoScroll));
  track.addEventListener('mouseleave', () => {
    clearInterval(autoScroll);
    autoScroll = setInterval(() => {
      const newIndex = (currentIndex + 1) % slides.length;
      goToSlide(newIndex);
    }, 5000);
  });
}

// ─── Search Overlay ───
function initSearchOverlay() {
  const searchBtn = document.getElementById('navSearchBtn');
  const overlay = document.getElementById('searchOverlay');
  const input = document.getElementById('searchInput');
  
  if (!searchBtn || !overlay) return;
  
  searchBtn.addEventListener('click', () => {
    overlay.classList.add('active');
    setTimeout(() => input?.focus(), 100);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) {
      overlay.classList.remove('active');
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      overlay.classList.add('active');
      setTimeout(() => input?.focus(), 100);
    }
  });
  
  // Live search
  let searchTimeout;
  input?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = e.target.value.trim();
      if (query.length > 0) {
        performSearch(query);
      }
    }, 300);
  });
}

function performSearch(query) {
  const results = document.getElementById('searchResults');
  if (!results) return;
  
  const suggestions = [
    { icon: 'graduation-cap', text: 'Student Elections', link: 'voter/elections.html' },
    { icon: 'users', text: 'Nominations', link: 'voter/nominations.html' },
    { icon: 'calendar', text: 'Event Voting', link: 'voter/events.html' },
    { icon: 'award', text: 'Club Elections', link: 'voter/club-elections.html' },
    { icon: 'shield-check', text: 'Security Features', link: '#features' },
    { icon: 'bot', text: 'AI Assistant', link: '#features' },
  ];
  
  const filtered = suggestions.filter(s => 
    s.text.toLowerCase().includes(query.toLowerCase())
  );
  
  results.innerHTML = filtered.length > 0 ? filtered.map(s => `
    <a href="${s.link}" class="search-suggestion">
      <i data-lucide="${s.icon}"></i> ${s.text}
    </a>
  `).join('') : '<p class="search-no-results">No results found</p>';
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// ─── Voting Type Cards Mouse Effect ───
function initVotingTypeCards() {
  document.querySelectorAll('.voting-type-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });
}

// ─── Marquee Animation ───
function initMarqueeAnimation() {
  const marquee = document.querySelector('.marquee-track');
  if (!marquee) return;
  
  marquee.addEventListener('mouseenter', () => {
    marquee.style.animationPlayState = 'paused';
  });
  
  marquee.addEventListener('mouseleave', () => {
    marquee.style.animationPlayState = 'running';
  });
}

// ─── Newsletter Form ───
function initNewsletterForm() {
  const form = document.getElementById('newsletterForm');
  if (!form) return;
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailInput = form.querySelector('input[type="email"]');
    const email = emailInput?.value.trim();
    
    if (!email) {
      showToast('Please enter your email address.', 'error');
      return;
    }
    
    if (typeof validateEmail === 'function' && validateEmail(email)) {
      showToast('Thanks for subscribing! Check your email.', 'success');
      form.reset();
    } else if (typeof validateEmail === 'function') {
      showToast('Please enter a valid email address.', 'error');
    } else {
      // Fallback if main.js not loaded
      showToast('Thanks for subscribing!', 'success');
      form.reset();
    }
  });
}

// ─── Fallback Toast (if main.js not loaded) ───
function showToast(message, type = 'info', duration = 3000) {
  // Use main.js toast if available
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    return window.showToast(message, type, duration);
  }
  
  // Fallback toast
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = `
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const bgColors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  
  toast.style.cssText = `
    padding: 1rem;
    background: white;
    border-left: 4px solid ${bgColors[type] || bgColors.info};
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
    font-size: 0.875rem;
    max-width: 350px;
  `;
  toast.textContent = message;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}