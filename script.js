// ===========================
// Navbar scroll effect
// ===========================
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
});

// ===========================
// Mobile menu toggle
// ===========================
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const navLinks = document.querySelector('.nav-links');

mobileMenuToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    mobileMenuToggle.classList.toggle('active');
});

// ===========================
// Smooth scrolling for nav links
// ===========================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 80;
            window.scrollTo({ top: offsetTop, behavior: 'smooth' });
            navLinks.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            this.classList.add('active');
        }
    });
});

// ===========================
// Intersection Observer – scroll animations
// ===========================
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('section, .about-card, .value-card, .team-member, .objective-step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// ===========================
// Background Slideshow – auto-play every 10 seconds
// ===========================
let currentSlide = 0;
const bgSlides = document.querySelectorAll('.bg-slide');

if (bgSlides.length > 0) bgSlides[0].classList.add('bg-active');

function showSlide(index) {
    bgSlides.forEach(s => s.classList.remove('bg-active'));
    bgSlides[index].classList.add('bg-active');
}

function nextBgSlide() {
    currentSlide = (currentSlide + 1) % bgSlides.length;
    showSlide(currentSlide);
}

if (bgSlides.length > 1) setInterval(nextBgSlide, 10000);

// ===========================
// Form submission handler
// ===========================
const appointmentForm = document.getElementById('appointmentForm');
const formMessage     = document.getElementById('formMessage');

appointmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        fullname:  document.getElementById('fullname').value,
        email:     document.getElementById('email').value,
        contact:   document.getElementById('contact').value,
        service:   document.getElementById('service').value,
        message:   document.getElementById('message').value,
        status:    'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!formData.fullname || !formData.email || !formData.contact || !formData.service) {
        showMessage('Please fill in all required fields.', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        showMessage('Please enter a valid email address.', 'error');
        return;
    }

    const submitButton = appointmentForm.querySelector('.btn-submit');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Submitting...';
    submitButton.disabled = true;

    try {
        await db.collection('appointments').add(formData);
        showMessage('Thank you! Your appointment request has been received. We will contact you within 24 hours.', 'success');
        appointmentForm.reset();
        formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Error submitting appointment:', error);
        showMessage('Sorry, there was an error submitting your request. Please try again or contact us directly.', 'error');
    } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
});

function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
    if (type === 'success') {
        setTimeout(() => { formMessage.style.display = 'none'; }, 5000);
    }
}

// ===========================
// Parallax effect for hero decoration (desktop only)
// ===========================
window.addEventListener('scroll', () => {
    const decoration = document.querySelector('.hero-decoration');
    if (decoration && window.innerWidth > 1024) {
        decoration.style.transform = `translateY(${window.pageYOffset * 0.3}px)`;
    }
});

// ===========================
// Floating cards hover effect
// ===========================
document.querySelectorAll('.floating-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.animationPlayState = 'paused';
        card.style.transform = 'scale(1.05)';
    });
    card.addEventListener('mouseleave', () => {
        card.style.animationPlayState = 'running';
        card.style.transform = 'scale(1)';
    });
});

// ===========================
// Update active nav link on scroll
// ===========================
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const scrollY  = window.pageYOffset;

    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        const sectionId  = section.getAttribute('id');
        if (scrollY > sectionTop && scrollY <= sectionTop + section.offsetHeight) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) link.classList.add('active');
            });
        }
    });
});

// ===========================
// Image loading animation
// ===========================
document.querySelectorAll('.member-image img').forEach(img => {
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.5s ease';
    img.addEventListener('load', () => { img.style.opacity = '1'; });
});

// ===========================
// Hero animations on page load
// ===========================
window.addEventListener('load', () => {
    document.querySelectorAll('.hero-badge, .hero-title, .hero-subtitle, .hero-cta').forEach((el, i) => {
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, i * 200);
    });
});

// ===========================
// Form field focus interactions
// ===========================
document.querySelectorAll('.form-group input, .form-group select, .form-group textarea').forEach(field => {
    field.addEventListener('focus', () => field.parentElement.classList.add('focused'));
    field.addEventListener('blur',  () => { if (!field.value) field.parentElement.classList.remove('focused'); });
});

// ===========================
// Value cards icon hover
// ===========================
document.querySelectorAll('.value-card').forEach(card => {
    const icon = card.querySelector('.value-icon');
    card.addEventListener('mouseenter', () => {
        icon.style.transform  = 'translateY(-10px) scale(1.1)';
        icon.style.transition = 'transform 0.3s ease';
    });
    card.addEventListener('mouseleave', () => { icon.style.transform = 'translateY(0) scale(1)'; });
});

// ===========================
// Card Slider – Clean & Reliable
// ===========================
(function () {
    const track   = document.querySelector('.carousel-track');
    const cards   = document.querySelectorAll('.carousel-card');
    const dots    = document.querySelectorAll('.carousel-dot');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    const counter = document.querySelector('.carousel-counter');

    if (!track || cards.length === 0) return;

    let idx = 0;
    let autoPlayTimer = null;
    const total = cards.length;

    function goTo(i) {
        idx = ((i % total) + total) % total;
        track.style.transform = `translateX(-${idx * 100}%)`;
        dots.forEach((d, j) => d.classList.toggle('active', j === idx));
        if (counter) counter.textContent = `${idx + 1} / ${total}`;
    }

    function next() { goTo(idx + 1); }
    function prev() { goTo(idx - 1); }

    function startAutoPlay() {
        stopAutoPlay();
        autoPlayTimer = setInterval(next, 4500);
    }
    function stopAutoPlay() {
        if (autoPlayTimer) { clearInterval(autoPlayTimer); autoPlayTimer = null; }
    }
    function resetAutoPlay() { stopAutoPlay(); setTimeout(startAutoPlay, 6000); }

    // Arrows
    if (prevBtn) prevBtn.addEventListener('click', () => { prev(); resetAutoPlay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { next(); resetAutoPlay(); });

    // Dots
    dots.forEach((d, i) => d.addEventListener('click', () => { goTo(i); resetAutoPlay(); }));

    // Keyboard
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft')  { prev(); resetAutoPlay(); }
        if (e.key === 'ArrowRight') { next(); resetAutoPlay(); }
    });

    // Touch swipe
    let touchStartX = 0;
    track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend',   e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) { diff > 0 ? next() : prev(); resetAutoPlay(); }
    });

    // Pause on hover
    const wrapper = document.querySelector('.carousel-wrapper');
    if (wrapper) {
        wrapper.addEventListener('mouseenter', stopAutoPlay);
        wrapper.addEventListener('mouseleave', startAutoPlay);
    }

    goTo(0);
    startAutoPlay();

    console.log("DAC's Building Design Services – Website Loaded Successfully");
    console.log('Card Slider initialized with', total, 'cards');
})();
