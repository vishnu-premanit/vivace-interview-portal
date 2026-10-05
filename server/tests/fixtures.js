'use strict';

const RESUME_TEXT = `Asha Verma
asha@example.com | BSc IT, Mumbai University (2025)

Skills: JavaScript, Angular, Node.js, MongoDB, SQL, Git, Docker

Projects
Built a canteen ordering web app with Angular and Node.js used by 600 students daily
Developed a REST API for library management with JWT authentication

Experience
Web Development Intern, PixelCraft (6 months experience)
Reduced page load time by 35% by lazy-loading images and caching API responses
Led a team of 4 students for the college hackathon and won second place

Certifications
AWS Certified Cloud Practitioner`;

const GOOD_ANSWER =
  'In my final year I was the backend lead for a canteen ordering app. My task was to keep orders fast during the lunch rush. ' +
  'First I profiled the API and found slow database queries, so I added an index on the orders collection and cached the menu. ' +
  'Then I set up load tests with 600 simulated students. As a result response time dropped from 2 seconds to 300 milliseconds, ' +
  'and complaints fell by 80%. I learned to measure before optimising.';

const TECH_ANSWER =
  'The OSI model has seven layers: physical, data link, network, transport, session, presentation and application. ' +
  'HTTP lives in the application layer while TCP is in the transport layer, which gives reliable, ordered, connection oriented delivery. ' +
  'For example when my browser loads a page, HTTP requests ride on a TCP connection after the three way handshake.';

module.exports = { RESUME_TEXT, GOOD_ANSWER, TECH_ANSWER };
