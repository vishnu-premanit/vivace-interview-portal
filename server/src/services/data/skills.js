'use strict';
/** Skill dictionary used by the Resume Truth Checker and JD Match. */

const SKILLS = [
  // programming & tech
  ['JavaScript', ['javascript', 'js', 'es6'], 'tech'],
  ['TypeScript', ['typescript', 'ts'], 'tech'],
  ['Python', ['python'], 'tech'],
  ['Java', ['java', 'core java', 'j2ee'], 'tech'],
  ['C', ['c programming', 'c language'], 'tech'],
  ['C++', ['c++', 'cpp'], 'tech'],
  ['C#', ['c#', 'csharp', '.net', 'dotnet', 'asp.net'], 'tech'],
  ['PHP', ['php', 'laravel'], 'tech'],
  ['Go', ['golang'], 'tech'],
  ['Kotlin', ['kotlin'], 'tech'],
  ['Swift', ['swift'], 'tech'],
  ['HTML/CSS', ['html', 'css', 'html5', 'css3', 'sass', 'scss', 'tailwind', 'bootstrap'], 'tech'],
  ['Angular', ['angular', 'angularjs'], 'tech'],
  ['React', ['react', 'reactjs', 'react.js', 'next.js', 'nextjs'], 'tech'],
  ['Vue', ['vue', 'vuejs', 'vue.js'], 'tech'],
  ['Node.js', ['nodejs', 'node.js', 'express.js', 'expressjs'], 'tech'],
  ['Django/Flask', ['django', 'flask', 'fastapi'], 'tech'],
  ['Spring', ['spring boot', 'springboot', 'spring framework', 'spring mvc', 'hibernate'], 'tech'],
  ['SQL', ['sql', 'mysql', 'postgresql', 'postgres', 'oracle', 'sql server', 'pl/sql', 'sqlite'], 'tech'],
  ['MongoDB', ['mongodb', 'mongo', 'mongoose', 'nosql'], 'tech'],
  ['REST APIs', ['restful', 'rest api', 'rest apis', 'api development', 'apis'], 'tech'],
  ['Git', ['git', 'github', 'gitlab', 'version control'], 'tech'],
  ['Docker', ['docker', 'containers', 'containerization'], 'tech'],
  ['Kubernetes', ['kubernetes', 'k8s'], 'tech'],
  ['AWS', ['aws', 'amazon web services', 'ec2', 's3', 'lambda'], 'tech'],
  ['Azure', ['azure'], 'tech'],
  ['GCP', ['gcp', 'google cloud', 'firebase'], 'tech'],
  ['Linux', ['linux', 'unix', 'bash', 'shell scripting'], 'tech'],
  ['CI/CD', ['ci/cd', 'jenkins', 'github actions', 'devops'], 'tech'],
  ['Testing', ['testing', 'unit testing', 'selenium', 'jest', 'junit', 'pytest', 'qa', 'test automation', 'manual testing'], 'tech'],
  ['Data Structures & Algorithms', ['data structures', 'algorithms', 'dsa', 'leetcode', 'competitive programming'], 'tech'],
  ['Machine Learning', ['machine learning', 'ml', 'scikit-learn', 'sklearn', 'regression', 'classification'], 'tech'],
  ['Deep Learning', ['deep learning', 'tensorflow', 'pytorch', 'keras', 'neural network', 'cnn', 'nlp'], 'tech'],
  ['Data Analysis', ['data analysis', 'pandas', 'numpy', 'analytics', 'data cleaning', 'eda'], 'tech'],
  ['Power BI / Tableau', ['power bi', 'powerbi', 'tableau', 'looker', 'dashboards', 'data visualization'], 'tech'],
  ['Statistics', ['statistics', 'hypothesis testing', 'probability', 'a/b testing'], 'tech'],
  ['Networking', ['networking', 'tcp/ip', 'ccna', 'lan', 'routing'], 'tech'],
  ['Cybersecurity', ['cybersecurity', 'security', 'penetration testing', 'owasp', 'ethical hacking'], 'tech'],
  ['Android', ['android', 'android studio'], 'tech'],
  // commerce & finance
  ['Tally', ['tally', 'tally erp', 'tally prime'], 'finance'],
  ['Accounting', ['accounting', 'bookkeeping', 'journal entries', 'ledger', 'accounts payable', 'accounts receivable'], 'finance'],
  ['GST & Taxation', ['gst', 'taxation', 'income tax', 'tds', 'tax filing', 'itr'], 'finance'],
  ['Auditing', ['audit', 'auditing', 'internal audit', 'statutory audit'], 'finance'],
  ['Financial Analysis', ['financial analysis', 'financial modelling', 'financial modeling', 'valuation', 'dcf', 'ratio analysis'], 'finance'],
  ['Excel', ['excel', 'ms excel', 'advanced excel', 'vlookup', 'pivot tables', 'spreadsheets'], 'finance'],
  ['SAP', ['sap', 'sap fico', 'erp'], 'finance'],
  ['Banking', ['banking', 'kyc', 'credit analysis', 'loans'], 'finance'],
  ['Investment & Markets', ['stock market', 'equity research', 'mutual funds', 'portfolio', 'derivatives', 'nism', 'cfa'], 'finance'],
  // management
  ['Marketing', ['marketing', 'brand management', 'branding', 'market research'], 'management'],
  ['Digital Marketing', ['digital marketing', 'seo', 'sem', 'social media marketing', 'google ads', 'content marketing', 'email marketing'], 'management'],
  ['Sales', ['sales', 'business development', 'lead generation', 'b2b', 'b2c', 'crm', 'salesforce'], 'management'],
  ['HR', ['human resources', 'hr', 'recruitment', 'talent acquisition', 'onboarding', 'payroll'], 'management'],
  ['Operations', ['operations', 'supply chain', 'logistics', 'inventory', 'procurement'], 'management'],
  ['Project Management', ['project management', 'agile', 'scrum', 'jira', 'pmp', 'kanban'], 'management'],
  ['Product Management', ['product management', 'product roadmap', 'user research', 'prd'], 'management'],
  ['Strategy', ['strategy', 'consulting', 'business strategy', 'case study'], 'management'],
  // soft skills
  ['Communication', ['communication', 'presentation', 'public speaking', 'writing'], 'soft'],
  ['Leadership', ['leadership', 'team lead', 'led a team', 'captain', 'president', 'head of'], 'soft'],
  ['Teamwork', ['teamwork', 'collaboration', 'team player'], 'soft'],
  ['Problem Solving', ['problem solving', 'analytical', 'critical thinking'], 'soft'],
  ['Research', ['research', 'research paper', 'publication', 'literature review'], 'soft'],
  ['Content Writing', ['content writing', 'copywriting', 'blogging', 'editing'], 'soft']
].map(([name, aliases, category]) => ({ name, aliases, category }));

const PATTERNS = SKILLS.map((s) => ({
  skill: s,
  regexes: s.aliases.map((a) => {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    // Short aliases ("ml", "js", "c") must be whole words; symbols need custom boundaries.
    return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, 'i');
  })
}));

function extractSkills(text) {
  const src = String(text || '');
  const found = [];
  for (const { skill, regexes } of PATTERNS) {
    if (regexes.some((re) => re.test(src))) found.push(skill.name);
  }
  return found;
}

function skillCategory(name) {
  const s = SKILLS.find((x) => x.name === name);
  return s ? s.category : 'other';
}

module.exports = { SKILLS, extractSkills, skillCategory };
