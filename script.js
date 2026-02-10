// Navbar scroll effect
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

// Mobile menu toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const navLinks = document.querySelector('.nav-links');

mobileMenuToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    mobileMenuToggle.classList.toggle('active');
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        
        if (target) {
            const offsetTop = target.offsetTop - 80;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
            
            // Close mobile menu if open
            navLinks.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
            
            // Update active nav link
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });
            this.classList.add('active');
        }
    });
});

// Intersection Observer for scroll animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections and cards
document.querySelectorAll('section, .about-card, .value-card, .team-member, .objective-step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Background Slideshow Functionality - Auto-play every 10 seconds
let currentSlide = 0;
const bgSlides = document.querySelectorAll('.bg-slide');

// Show first slide initially
if (bgSlides.length > 0) {
    bgSlides[0].classList.add('bg-active');
}

function showSlide(index) {
    // Remove active class from all background slides
    bgSlides.forEach(bgSlide => bgSlide.classList.remove('bg-active'));
    
    // Add active class to current background slide
    bgSlides[index].classList.add('bg-active');
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % bgSlides.length;
    showSlide(currentSlide);
}

// Start automatic slideshow - changes every 10 seconds
if (bgSlides.length > 1) {
    setInterval(nextSlide, 10000); // 10 seconds per slide
}

// Form submission handler
const appointmentForm = document.getElementById('appointmentForm');
const formMessage = document.getElementById('formMessage');

appointmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Get form data
    const formData = {
        fullname: document.getElementById('fullname').value,
        email: document.getElementById('email').value,
        contact: document.getElementById('contact').value,
        service: document.getElementById('service').value,
        message: document.getElementById('message').value,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Validate form
    if (!formData.fullname || !formData.email || !formData.contact || !formData.service) {
        showMessage('Please fill in all required fields.', 'error');
        return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
        showMessage('Please enter a valid email address.', 'error');
        return;
    }
    
    // Show loading state
    const submitButton = appointmentForm.querySelector('.btn-submit');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Submitting...';
    submitButton.disabled = true;
    
    try {
        // Save to Firebase Firestore
        await db.collection('appointments').add(formData);
        
        // Show success message
        showMessage('Thank you! Your appointment request has been received. We will contact you within 24 hours.', 'success');
        
        // Reset form
        appointmentForm.reset();
        
        // Scroll to message
        formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Error submitting appointment:', error);
        showMessage('Sorry, there was an error submitting your request. Please try again or contact us directly.', 'error');
    } finally {
        // Reset button
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
});

function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
    
    // Auto-hide success message after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            formMessage.style.display = 'none';
        }, 5000);
    }
}

// Parallax effect for hero decoration (desktop only)
window.addEventListener('scroll', () => {
    const decoration = document.querySelector('.hero-decoration');
    if (decoration && window.innerWidth > 1024) {
        const scrolled = window.pageYOffset;
        decoration.style.transform = `translateY(${scrolled * 0.3}px)`;
    }
});

// Add hover effect to floating cards
const floatingCards = document.querySelectorAll('.floating-card');
floatingCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
        card.style.animationPlayState = 'paused';
        card.style.transform = 'scale(1.05)';
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.animationPlayState = 'running';
        card.style.transform = 'scale(1)';
    });
});

// Update active nav link on scroll
window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.pageYOffset;
    
    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');
        
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
});

// Add loading animation to images
document.querySelectorAll('.member-image img').forEach(img => {
    img.addEventListener('load', () => {
        img.style.opacity = '1';
    });
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.5s ease';
});

// Initialize animations on page load
window.addEventListener('load', () => {
    // Trigger hero animations
    document.querySelectorAll('.hero-badge, .hero-title, .hero-subtitle, .hero-cta').forEach((el, index) => {
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 200);
    });
});

// Handle form field interactions
document.querySelectorAll('.form-group input, .form-group select, .form-group textarea').forEach(field => {
    field.addEventListener('focus', () => {
        field.parentElement.classList.add('focused');
    });
    
    field.addEventListener('blur', () => {
        if (!field.value) {
            field.parentElement.classList.remove('focused');
        }
    });
});

// Add floating animation to value cards on hover
document.querySelectorAll('.value-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        const icon = card.querySelector('.value-icon');
        icon.style.transform = 'translateY(-10px) scale(1.1)';
        icon.style.transition = 'transform 0.3s ease';
    });
    
    card.addEventListener('mouseleave', () => {
        const icon = card.querySelector('.value-icon');
        icon.style.transform = 'translateY(0) scale(1)';
    });
});

// Console log for debugging
console.log('DAC\'s Building Design Services - Website Loaded Successfully');
console.log('Automatic background slideshow initialized with', bgSlides.length, 'slides');
console.log('Slideshow transitions every 10 seconds');
console.log('All interactive features initialized');
