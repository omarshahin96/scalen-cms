const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS blog_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category_id INTEGER REFERENCES blog_categories(id),
    excerpt TEXT,
    content TEXT,
    image TEXT,
    status TEXT DEFAULT 'draft',
    author TEXT DEFAULT 'Admin',
    read_time TEXT DEFAULT '5 min read',
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT 'fa-star',
    description TEXT,
    features TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT,
    client TEXT,
    year TEXT,
    description TEXT,
    results TEXT,
    image TEXT,
    status TEXT DEFAULT 'active',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    company TEXT,
    quote TEXT,
    rating INTEGER DEFAULT 5,
    avatar TEXT,
    status TEXT DEFAULT 'active',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS team (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    bio TEXT,
    photo TEXT,
    linkedin TEXT,
    twitter TEXT,
    instagram TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    subject TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    label TEXT,
    type TEXT DEFAULT 'text',
    group_name TEXT DEFAULT 'general'
  );

  CREATE TABLE IF NOT EXISTS homepage (
    section TEXT PRIMARY KEY,
    data TEXT
  );
`);

// ─── SEED DEFAULT DATA ─────────────────────────────────────────────────────
function seedIfEmpty() {
  // Admin user
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@reliable.com');
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run('Admin', 'admin@reliable.com', hash, 'admin');
  }

  // Blog categories
  const catCount = db.prepare('SELECT COUNT(*) as n FROM blog_categories').get().n;
  if (catCount === 0) {
    const cats = [
      { name: 'SEO', slug: 'seo' },
      { name: 'Social Media', slug: 'social-media' },
      { name: 'Content Marketing', slug: 'content' },
      { name: 'PPC', slug: 'ppc' },
      { name: 'Brand Strategy', slug: 'brand' },
      { name: 'Analytics', slug: 'analytics' },
    ];
    const ins = db.prepare('INSERT INTO blog_categories (name, slug) VALUES (?, ?)');
    cats.forEach(c => ins.run(c.name, c.slug));
  }

  // Services
  const svcCount = db.prepare('SELECT COUNT(*) as n FROM services').get().n;
  if (svcCount === 0) {
    const svcs = [
      { title: 'SEO Optimization', slug: 'seo-optimization', icon: 'fa-magnifying-glass-chart', description: 'Dominate search rankings with data-driven SEO strategies that drive organic growth.' },
      { title: 'Content Marketing', slug: 'content-marketing', icon: 'fa-pen-nib', description: 'Craft compelling content that converts visitors into loyal customers.' },
      { title: 'Social Media Management', slug: 'social-media', icon: 'fa-share-nodes', description: 'Build engaged communities and amplify your brand across all social channels.' },
      { title: 'PPC Advertising', slug: 'ppc-advertising', icon: 'fa-bullseye', description: 'Maximize ROI with targeted pay-per-click campaigns across Google, Meta, and beyond.' },
      { title: 'Brand Strategy', slug: 'brand-strategy', icon: 'fa-lightbulb', description: 'Define your brand identity and position yourself ahead of the competition.' },
      { title: 'Web Design & Development', slug: 'web-design', icon: 'fa-code', description: 'Build stunning, conversion-optimized websites that drive business results.' },
    ];
    const ins = db.prepare('INSERT INTO services (title, slug, icon, description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)');
    svcs.forEach((s, i) => ins.run(s.title, s.slug, s.icon, s.description, i, 'active'));
  }

  // Testimonials
  const testCount = db.prepare('SELECT COUNT(*) as n FROM testimonials').get().n;
  if (testCount === 0) {
    const tests = [
      { name: 'Sarah Mitchell', role: 'CEO', company: 'TechFlow Solutions', quote: 'Reliable transformed our digital presence. Our organic traffic grew by 340% in just 6 months!', rating: 5 },
      { name: 'James Chen', role: 'Marketing Director', company: 'Apex Retail', quote: 'The team at Reliable truly understands performance marketing. Our ROAS improved by 280%.', rating: 5 },
      { name: 'Priya Sharma', role: 'Founder', company: 'GreenLeaf Co.', quote: 'From brand strategy to social media, they handle everything flawlessly. Highly recommend!', rating: 5 },
    ];
    const ins = db.prepare('INSERT INTO testimonials (name, role, company, quote, rating, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    tests.forEach((t, i) => ins.run(t.name, t.role, t.company, t.quote, t.rating, i, 'active'));
  }

  // Team
  const teamCount = db.prepare('SELECT COUNT(*) as n FROM team').get().n;
  if (teamCount === 0) {
    const members = [
      { name: 'Alex Rivera', role: 'CEO & Founder', linkedin: '#', twitter: '#', instagram: '#' },
      { name: 'Maya Johnson', role: 'Head of SEO', linkedin: '#', twitter: '#', instagram: '#' },
      { name: 'Tom Park', role: 'Creative Director', linkedin: '#', twitter: '#', instagram: '#' },
      { name: 'Lisa Wang', role: 'PPC Specialist', linkedin: '#', twitter: '#', instagram: '#' },
    ];
    const ins = db.prepare('INSERT INTO team (name, role, linkedin, twitter, instagram, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    members.forEach((m, i) => ins.run(m.name, m.role, m.linkedin, m.twitter, m.instagram, i, 'active'));
  }

  // Homepage sections — INSERT OR IGNORE so re-seeding never overwrites edits
  const hpIns = db.prepare('INSERT OR IGNORE INTO homepage (section, data) VALUES (?, ?)');

  // ── Homepage (index.html) ──
  hpIns.run('hero', JSON.stringify({
    badge: 'Award Winning Agency',
    headline: 'Award-Winning Digital Marketing Agency defined by Results',
    subtitle: 'We transform brands through data-driven strategies, compelling content, and innovative digital solutions that deliver measurable growth.',
    btn1_text: 'Our Services', btn1_url: 'services.html',
    btn2_text: 'View Portfolio', btn2_url: 'portfolio.html',
    clients_text: '+4K Happy Clients',
    image: ''
  }));
  hpIns.run('stats', JSON.stringify([
    { number: '4', suffix: 'K+', label: 'Happy Clients' },
    { number: '98', suffix: '%', label: 'Success Rate' },
    { number: '12', suffix: '+', label: 'Years Experience' },
    { number: '500', suffix: '+', label: 'Projects Completed' }
  ]));
  hpIns.run('about', JSON.stringify({
    headline: 'About Our Agency',
    body: 'We are a full-service digital marketing agency with over 12 years of experience helping businesses grow online. Our team of strategists, creatives, and technologists work together to deliver campaigns that generate real, measurable results.\n\nFrom startups to Fortune 500 companies, we\'ve helped brands across all industries build powerful digital presences and achieve ambitious growth goals.',
    years_badge: '12+',
    btn_text: 'Read More About Us',
    btn_url: 'about.html',
    image1: '', image2: ''
  }));
  hpIns.run('skills', JSON.stringify([
    { name: 'SEO Optimization', percent: 92 },
    { name: 'Content Marketing', percent: 88 },
    { name: 'Social Media Growth', percent: 85 }
  ]));
  hpIns.run('marquee', JSON.stringify([
    'SEO Optimization', 'Content Marketing', 'Social Media', 'PPC Advertising',
    'Brand Strategy', 'Web Design', 'Email Marketing', 'Analytics & Reporting'
  ]));
  hpIns.run('contact', JSON.stringify({
    address: '123 Marketing Street, New York, NY 10001',
    phone: '+1 (555) 234-9823',
    email: 'hello@reliableagency.com',
    hours: 'Mon – Fri: 9:00 AM – 6:00 PM'
  }));
  hpIns.run('footer', JSON.stringify({
    tagline: 'Award-winning digital marketing agency helping businesses grow through data-driven strategies and creative excellence.',
    copyright: '© 2026 Reliable Agency. All rights reserved.'
  }));

  // ── About page (about.html) ──
  hpIns.run('about_page', JSON.stringify({
    title: 'About Our Agency',
    description: 'Driven by data, powered by creativity — we\'ve been helping brands grow for over 12 years.'
  }));
  hpIns.run('about_story', JSON.stringify({
    heading: 'We Started Small, Grew Through Results',
    body1: 'Founded in 2012, Reliable began as a small SEO consultancy with a simple belief: every business deserves a digital presence that works as hard as they do. Over the past 12 years, we\'ve evolved into a full-service digital marketing powerhouse.',
    body2: 'Today our team of 50+ strategists, creatives, and technologists serve clients across 20+ industries worldwide, delivering campaigns that consistently exceed expectations.',
    image: 'assets/img/wc4.webp',
    items: ['4,000+ successful client partnerships', '98% client satisfaction and retention rate', 'Multiple industry awards and recognitions', 'Serving clients across 30+ countries'],
    btn_text: 'Start Your Journey', btn_url: 'contact.html'
  }));
  hpIns.run('about_values', JSON.stringify([
    { icon: 'fas fa-bullseye', title: 'Results First', description: 'Every decision we make is driven by measurable outcomes. We track, optimize, and report on everything that matters to your bottom line.' },
    { icon: 'fas fa-lightbulb', title: 'Creative Excellence', description: 'We blend data-driven insights with bold creative thinking to craft campaigns that capture attention and inspire action.' },
    { icon: 'fas fa-handshake', title: 'True Partnership', description: 'We become an extension of your team — deeply invested in your success, transparent in communication, and always accessible.' },
    { icon: 'fas fa-chart-line', title: 'Continuous Growth', description: 'The digital landscape never stops evolving. Neither do we. We stay ahead of trends so your brand always leads the conversation.' },
    { icon: 'fas fa-shield-alt', title: 'Integrity Always', description: 'No shortcuts, no black-hat tactics, no misleading reports. We build sustainable growth through ethical, proven strategies.' },
    { icon: 'fas fa-users', title: 'People-Centric', description: 'Behind every campaign is a real business with real people. We never lose sight of the human element in everything we do.' }
  ]));
  hpIns.run('about_cta', JSON.stringify({
    heading: 'Let\'s Build Something Great Together',
    description: 'Join 4,000+ businesses that trust Reliable to grow their digital presence and drive real results.',
    btn1_text: 'Get Free Consultation', btn1_url: 'contact.html',
    btn2_text: 'View Our Work', btn2_url: 'portfolio.html'
  }));

  // ── Services page (services.html) ──
  hpIns.run('services_page', JSON.stringify({
    title: 'Our Services',
    description: 'Comprehensive digital marketing solutions tailored to your unique business goals and growth targets.'
  }));
  hpIns.run('services_featured', JSON.stringify([
    {
      label: 'SEO Services', heading: 'Rank Higher, Grow Faster',
      body: 'Our SEO service is built on a foundation of technical excellence, content strategy, and authoritative link acquisition. We don\'t chase algorithm tricks — we build sustainable rankings that compound over time.',
      image: 'assets/img/wc2.webp',
      features: ['Full technical SEO audit & implementation', 'Keyword research & competitive gap analysis', 'On-page & content optimization', 'High-authority link building campaigns', 'Local SEO & Google Business optimization'],
      btn_text: 'Start SEO Campaign', btn_url: 'contact.html'
    },
    {
      label: 'Social Media', heading: 'Build Community, Drive Sales',
      body: 'Social media is more than posting — it\'s about building a loyal community that amplifies your brand organically while your paid campaigns convert at scale.',
      image: 'assets/img/wc4.webp',
      features: ['Platform strategy & content calendar creation', 'Daily content creation & community management', 'Paid social campaigns (Meta, TikTok, LinkedIn)', 'Influencer partnership management', 'Monthly analytics & optimization reports'],
      btn_text: 'Grow My Social', btn_url: 'contact.html'
    }
  ]));
  hpIns.run('services_pricing', JSON.stringify({
    heading: 'Simple, Transparent Pricing',
    description: 'No hidden fees, no lock-in contracts. Pick the plan that fits your growth stage.',
    plans: [
      { name: 'Starter', price: '999', period: 'per month', popular: false, btn_text: 'Get Started', btn_url: 'contact.html', features: [{ text: 'SEO Audit & Strategy', included: true }, { text: '4 Blog Posts / Month', included: true }, { text: 'Social Media (2 platforms)', included: true }, { text: 'Monthly Report', included: true }, { text: 'PPC Management', included: false }, { text: 'Dedicated Account Manager', included: false }] },
      { name: 'Growth', price: '2,499', period: 'per month', popular: true, btn_text: 'Get Started', btn_url: 'contact.html', features: [{ text: 'Full SEO Campaign', included: true }, { text: '8 Blog Posts / Month', included: true }, { text: 'Social Media (4 platforms)', included: true }, { text: 'PPC Management (up to $10K)', included: true }, { text: 'Bi-weekly Reports', included: true }, { text: 'Dedicated Account Manager', included: true }] },
      { name: 'Enterprise', price: 'Custom', period: 'tailored to you', popular: false, btn_text: 'Talk to Us', btn_url: 'contact.html', features: [{ text: 'Everything in Growth', included: true }, { text: 'Unlimited Content', included: true }, { text: 'All Platforms Managed', included: true }, { text: 'Unlimited PPC Budget', included: true }, { text: 'Weekly Strategy Calls', included: true }, { text: 'Priority 24/7 Support', included: true }] }
    ]
  }));
  hpIns.run('services_cta', JSON.stringify({
    heading: 'Not Sure Which Plan Fits?',
    description: 'Book a free 30-minute strategy call. We\'ll audit your current presence and recommend the exact services you need.',
    btn1_text: 'Book Free Strategy Call', btn1_url: 'contact.html',
    btn2_text: 'See Our Results', btn2_url: 'portfolio.html'
  }));

  // ── Contact page (contact.html) ──
  hpIns.run('contact_page', JSON.stringify({
    label: 'GET IN TOUCH', title: 'Contact Our Team',
    intro: 'We\'d love to hear about your project. Reach out and one of our specialists will get back to you within 24 hours.',
    form_heading: 'Send Us a Message',
    form_subheading: 'Fill in the form below and we\'ll get back to you shortly.',
    map_heading: 'Find Us Here',
    map_address: '123 Marketing Street, Suite 400 — New York, NY 10001'
  }));
  hpIns.run('contact_office', JSON.stringify({
    address: '123 Marketing Street, Suite 400\nNew York, NY 10001, USA',
    phone1: '+1 (212) 555-0100', phone2: '+1 (212) 555-0101',
    email1: 'hello@reliableagency.com', email2: 'support@reliableagency.com',
    hours1: 'Mon – Fri: 9:00 AM – 6:00 PM', hours2: 'Sat – Sun: Closed'
  }));
  hpIns.run('contact_faqs', JSON.stringify([
    { question: 'How long does it take to see results from SEO?', answer: 'SEO is a long-term strategy. Most clients begin to see meaningful improvements in organic traffic and rankings within 3–6 months. However, results depend on factors like competition, domain authority, and the scope of work.' },
    { question: 'Do you offer custom packages or only fixed plans?', answer: 'While we do offer three standard tiers (Starter, Growth, and Enterprise), we understand that every business is unique. We\'re happy to create a fully custom package tailored to your specific goals, target audience, and budget.' },
    { question: 'What industries do you specialise in?', answer: 'We\'ve worked across a wide range of industries including e-commerce, SaaS, real estate, healthcare, hospitality, finance, and professional services.' },
    { question: 'Will I have a dedicated account manager?', answer: 'Yes. Every client is assigned a dedicated account manager who acts as your primary point of contact, ensuring a seamless and transparent experience.' },
    { question: 'How do we get started?', answer: 'Getting started is simple. Fill in the contact form on this page or book a free 30-minute consultation call. During that call, we\'ll discuss your current situation, your goals, and recommend the best approach.' },
    { question: 'Are there any long-term contracts?', answer: 'We offer month-to-month agreements as standard because we believe our results should speak for themselves. For clients looking for deeper commitment, we also offer 6-month and 12-month contracts with additional benefits.' }
  ]));
  hpIns.run('contact_social', JSON.stringify({
    heading: 'Follow Our Journey',
    subheading: 'Stay connected for tips, case studies, and industry insights.',
    linkedin: '#', twitter: '#', instagram: '#', facebook: '#'
  }));

  // ── Portfolio page (portfolio.html) ──
  hpIns.run('portfolio_page', JSON.stringify({
    hero: { title: 'Our Portfolio', description: 'A curated showcase of the campaigns, websites, and strategies we\'ve delivered for our clients.' },
    results_label: 'Real Results',
    results_heading: 'Case Study Highlights',
    results_description: 'Numbers that tell the story of campaigns that actually worked.',
    case_studies: [
      { image: 'assets/img/wc2.webp', tag: 'SEO Campaign', title: 'TechCorp — 340% Organic Traffic Growth', description: 'A 6-month SEO overhaul for a B2B SaaS company. Complete technical rebuild, content strategy, and link acquisition.', stats: [{num:'340%',label:'Traffic Growth'},{num:'#1',label:'Rankings for 12 Keywords'},{num:'5x',label:'Lead Volume'}], btn_text: 'Read Full Case Study', btn_url: 'case-techcorp.html' },
      { image: 'assets/img/wc4.webp', tag: 'Social Media', title: 'FashionBrand — 200% Follower Growth in 90 Days', description: 'Viral content strategy and paid social campaigns that tripled their Instagram following and doubled online sales.', stats: [{num:'200%',label:'Follower Growth'},{num:'5x',label:'Engagement Rate'},{num:'2x',label:'Online Sales'}], btn_text: 'Read Full Case Study', btn_url: 'case-fashionbrand.html' },
      { image: 'assets/img/wc5.webp', tag: 'PPC + Web Design', title: 'FinanceHub — 60% Lower Cost Per Lead', description: 'Combined landing page redesign with precision PPC targeting that slashed acquisition costs while tripling conversion rates.', stats: [{num:'60%',label:'Lower CPA'},{num:'3x',label:'Conversions'},{num:'420%',label:'ROAS'}], btn_text: 'Read Full Case Study', btn_url: 'case-financehub.html' }
    ],
    cta: { heading: 'Ready to Be Our Next Success Story?', description: 'Let\'s create a campaign that delivers results you\'ll be proud to talk about. Get your free strategy session today.', btn1_text: 'Start Your Project', btn1_url: 'contact.html', btn2_text: 'View All Services', btn2_url: 'services.html' }
  }));

  // ── Blog page (blog.html) ──
  hpIns.run('blog_page', JSON.stringify({
    hero: { title: 'Our Blog', description: 'Expert insights, digital marketing trends, and actionable strategies to grow your business online.' },
    sidebar_cta: {
      heading: 'Get a Free Strategy Call',
      description: 'Let our experts audit your digital presence and create a custom growth plan for your business.',
      btn_text: 'Book Free Call',
      btn_url: 'contact.html'
    }
  }));

  // Settings
  const settingCount = db.prepare('SELECT COUNT(*) as n FROM settings').get().n;
  if (settingCount === 0) {
    const defaults = [
      { key: 'site_name', value: 'Reliable', label: 'Site Name', type: 'text', group_name: 'general' },
      { key: 'tagline', value: 'Award-Winning Digital Marketing Agency', label: 'Tagline', type: 'text', group_name: 'general' },
      { key: 'email', value: 'hello@reliable.com', label: 'Contact Email', type: 'email', group_name: 'contact' },
      { key: 'phone', value: '+1 (555) 000-0000', label: 'Phone Number', type: 'text', group_name: 'contact' },
      { key: 'address', value: '123 Agency St, New York, NY 10001', label: 'Address', type: 'textarea', group_name: 'contact' },
      { key: 'linkedin', value: '#', label: 'LinkedIn URL', type: 'url', group_name: 'social' },
      { key: 'twitter', value: '#', label: 'Twitter URL', type: 'url', group_name: 'social' },
      { key: 'instagram', value: '#', label: 'Instagram URL', type: 'url', group_name: 'social' },
      { key: 'facebook', value: '#', label: 'Facebook URL', type: 'url', group_name: 'social' },
      { key: 'hero_headline', value: 'Award-Winning Digital Marketing Agency defined by Results', label: 'Hero Headline', type: 'text', group_name: 'homepage' },
      { key: 'hero_subtitle', value: 'We help ambitious brands grow faster with data-driven strategies, creative content, and performance marketing.', label: 'Hero Subtitle', type: 'textarea', group_name: 'homepage' },
      { key: 'meta_description', value: 'Reliable — Award-winning digital marketing agency helping brands grow with SEO, content, social media and PPC.', label: 'Meta Description', type: 'textarea', group_name: 'seo' },
      { key: 'gtm_head', value: '', label: 'GTM / GA4 Head Code', type: 'textarea', group_name: 'tracking' },
      { key: 'gtm_body', value: '', label: 'GTM Body (noscript) Code', type: 'textarea', group_name: 'tracking' },
      { key: 'meta_pixel', value: '', label: 'Meta (Facebook) Pixel Code', type: 'textarea', group_name: 'tracking' },
      { key: 'custom_head', value: '', label: 'Custom Head Code (any snippet)', type: 'textarea', group_name: 'tracking' },
    ];
    const ins = db.prepare('INSERT INTO settings (key, value, label, type, group_name) VALUES (?, ?, ?, ?, ?)');
    defaults.forEach(s => ins.run(s.key, s.value, s.label, s.type, s.group_name));
  }
}

seedIfEmpty();

module.exports = db;
