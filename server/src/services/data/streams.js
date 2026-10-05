'use strict';
/**
 * Offline question bank. Used when no Gemini key is configured (or Gemini fails),
 * and as the "expected key points" source for answer gap detection.
 *
 * keyPoints: phrases the evaluator looks for. Alternatives are separated by "|".
 * difficulty: 1 (warm-up) … 5 (senior / stretch)
 */

const COMPETENCIES = [
  { id: 'communication', label: 'Communication' },
  { id: 'domain', label: 'Domain knowledge' },
  { id: 'problemSolving', label: 'Problem solving' },
  { id: 'analytical', label: 'Analytical thinking' },
  { id: 'teamwork', label: 'Teamwork' },
  { id: 'leadership', label: 'Ownership & leadership' },
  { id: 'adaptability', label: 'Adaptability' },
  { id: 'professionalism', label: 'Professionalism' }
];

const q = (id, text, competency, difficulty, keyPoints, type = 'technical') => ({
  id,
  text,
  competency,
  difficulty,
  keyPoints,
  type
});

const COMMON = [
  q('hr-intro', 'Walk me through your background and what brings you to this role.', 'communication', 1,
    ['education|degree|studied', 'project|internship|experience', 'skill|strength', 'role|position|company|why'], 'behavioral'),
  q('hr-strength', 'What would your last team lead or professor say is your strongest skill? Give an example.', 'communication', 1,
    ['specific skill|strength', 'example|instance|time when', 'result|impact|outcome'], 'behavioral'),
  q('hr-weakness', 'Tell me about a weakness you are actively working on.', 'adaptability', 2,
    ['genuine weakness|area to improve', 'steps|working on|practice|course', 'progress|improved|result'], 'behavioral'),
  q('hr-conflict', 'Describe a time you disagreed with a teammate. How did you handle it?', 'teamwork', 2,
    ['situation|context', 'listened|understand|perspective', 'compromise|resolved|agreed', 'outcome|result|learned'], 'behavioral'),
  q('hr-failure', 'Tell me about something that did not go to plan and what you changed afterwards.', 'adaptability', 3,
    ['situation|project', 'mistake|failed|went wrong', 'responsibility|my part|i should', 'changed|learned|now i'], 'behavioral'),
  q('hr-deadline', 'Describe a situation where you had to deliver under a tight deadline.', 'professionalism', 2,
    ['deadline|time pressure', 'prioritise|prioritize|plan', 'action|did', 'delivered|result|on time'], 'behavioral'),
  q('hr-lead', 'Give me an example of a time you took ownership of something nobody asked you to do.', 'leadership', 3,
    ['noticed|problem|gap', 'initiative|took ownership|volunteered', 'action|steps', 'impact|result|measur'], 'behavioral'),
  q('hr-why-us', 'Why should we pick you over other candidates with a similar degree?', 'communication', 3,
    ['unique|different', 'evidence|example|project', 'value|contribute|benefit', 'fit|role|company'], 'behavioral'),
  q('hr-pressure', 'How do you decide what to work on when everything feels urgent?', 'problemSolving', 3,
    ['prioritise|prioritize|urgent important', 'stakeholder|manager|communicate', 'impact|deadline', 'example'], 'situational'),
  q('hr-feedback', 'Tell me about the hardest piece of feedback you have received.', 'adaptability', 3,
    ['feedback|criticism', 'reaction|felt|accepted', 'changed|acted|improved', 'result|now'], 'behavioral'),
  q('hr-5years', 'Where do you see your career in five years, realistically?', 'professionalism', 1,
    ['goal|aim|plan', 'skill|grow|learn', 'role|responsibility', 'connect|this role|company'], 'behavioral'),
  q('hr-ethics', 'You notice a colleague reporting numbers that look inflated. What do you do?', 'professionalism', 4,
    ['verify|check facts', 'talk|raise|speak privately', 'escalate|manager|policy', 'integrity|ethic|honest'], 'situational'),
  q('hr-team-lazy', 'One person in your group project is not contributing. Walk me through what you would do.', 'teamwork', 2,
    ['talk|conversation|understand reason', 'redistribute|reassign|clarify roles', 'escalate|mentor|guide', 'deliver|outcome'], 'situational'),
  q('hr-learn-fast', 'Tell me about a time you had to learn something new very quickly.', 'adaptability', 2,
    ['situation|needed to learn', 'approach|resources|documentation|course', 'applied|used', 'result|outcome'], 'behavioral'),
  q('hr-data-decision', 'Describe a decision you made using data rather than gut feeling.', 'analytical', 4,
    ['decision|choice', 'data|numbers|metrics|analysis', 'insight|found', 'result|impact|percent|%'], 'behavioral')
];

const STREAMS = [
  {
    id: 'bsc-it',
    name: 'BSc IT',
    full: 'Bachelor of Science in Information Technology',
    group: 'Technology',
    roles: ['Software Developer', 'IT Support Engineer', 'Web Developer', 'QA Engineer'],
    focus: { domain: 80, problemSolving: 75, analytical: 70, communication: 65, teamwork: 60, leadership: 50, adaptability: 65, professionalism: 60 },
    questions: [
      q('it-osi', 'Explain the OSI model and where HTTP and TCP sit in it.', 'domain', 1,
        ['seven layers|7 layers', 'application layer', 'transport layer', 'tcp reliable|connection oriented', 'http']),
      q('it-dbms-norm', 'What is normalisation in a database and why would you ever denormalise?', 'domain', 2,
        ['redundancy|duplicate', '1nf|2nf|3nf|normal form', 'anomal', 'denormal|performance|read speed|join']),
      q('it-sql-join', 'What is the difference between an INNER JOIN and a LEFT JOIN? When does it matter?', 'domain', 2,
        ['inner join|matching rows', 'left join|all rows from left', 'null', 'example']),
      q('it-oop', 'Explain the four pillars of object-oriented programming with a real example.', 'domain', 1,
        ['encapsulation', 'inheritance', 'polymorphism', 'abstraction', 'example']),
      q('it-http-status', 'A web page loads slowly for some users only. How would you investigate?', 'problemSolving', 3,
        ['reproduce|narrow down', 'network|latency|cdn|region', 'browser|devtools|logs', 'server|database|query', 'measure|monitor']),
      q('it-rest', 'What makes an API RESTful? Name a few HTTP methods and what they should do.', 'domain', 2,
        ['resource|uri|endpoint', 'stateless', 'get|post|put|delete', 'status code']),
      q('it-security', 'How would you store user passwords securely?', 'domain', 3,
        ['hash', 'salt', 'bcrypt|argon|scrypt', 'never plain|not plaintext', 'https|tls']),
      q('it-git', 'Your teammate force-pushed and your commits disappeared from the branch. What do you do?', 'problemSolving', 3,
        ['reflog|local copy', 'recover|restore|cherry-pick', 'communicate|talk', 'protect branch|prevent']),
      q('it-cloud', 'Explain IaaS, PaaS and SaaS with one example of each.', 'domain', 2,
        ['iaas|infrastructure', 'paas|platform', 'saas|software', 'example|aws|azure|gmail|heroku']),
      q('it-scale', 'A college event registration site crashes every year on launch day. Design something better.', 'problemSolving', 4,
        ['load|traffic|spike', 'cache|cdn', 'scale|load balancer|horizontal', 'queue|rate limit', 'database|index|test']),
      q('it-testing', 'What is the difference between unit, integration and end-to-end testing?', 'domain', 2,
        ['unit|single function', 'integration|components together', 'end-to-end|user flow', 'automation|ci']),
      q('it-incident', 'Production is down at 2 a.m. and you are on call. Walk me through your first 15 minutes.', 'professionalism', 5,
        ['acknowledge|alert', 'impact|scope|users', 'logs|monitoring|recent deploy', 'rollback|mitigate', 'communicate|status|postmortem'])
    ]
  },
  {
    id: 'bca',
    name: 'BCA',
    full: 'Bachelor of Computer Applications',
    group: 'Technology',
    roles: ['Junior Developer', 'Application Support', 'Front-end Developer', 'Database Assistant'],
    focus: { domain: 78, problemSolving: 75, analytical: 68, communication: 62, teamwork: 60, leadership: 48, adaptability: 65, professionalism: 60 },
    questions: [
      q('bca-c-pointer', 'What is a pointer in C and why can it be dangerous?', 'domain', 2,
        ['memory address', 'dereference', 'null|dangling|wild', 'segmentation|crash|undefined']),
      q('bca-array-ll', 'When would you choose a linked list over an array?', 'domain', 2,
        ['insert|delete|frequent', 'contiguous|random access', 'memory|dynamic size', 'big o|o(1)|o(n)']),
      q('bca-sdlc', 'Explain the SDLC and compare Waterfall with Agile.', 'domain', 1,
        ['requirements|design|testing|deployment', 'waterfall|sequential', 'agile|iterative|sprint', 'feedback|change']),
      q('bca-stack', 'Explain stacks and queues and give a real use of each.', 'domain', 1,
        ['lifo|last in first out', 'fifo|first in first out', 'undo|recursion|call stack', 'printer|scheduling|queue']),
      q('bca-js', 'What is the difference between let, const and var in JavaScript?', 'domain', 2,
        ['scope|block|function', 'hoist', 'reassign|const', 'temporal dead zone|tdz']),
      q('bca-sort', 'Which sorting algorithm would you use for a nearly sorted list, and why?', 'analytical', 3,
        ['insertion sort', 'nearly sorted|almost sorted', 'o(n)|linear|best case', 'stable']),
      q('bca-index', 'What is a database index and what does it cost you?', 'domain', 3,
        ['faster|lookup|search', 'b-tree|tree', 'write|insert slower', 'storage|space']),
      q('bca-bug', 'A form saves data on your machine but not on the client\'s. How do you debug it?', 'problemSolving', 3,
        ['reproduce|environment', 'logs|console|error', 'network|api|request', 'config|version|browser', 'fix|verify']),
      q('bca-responsive', 'How do you make a page work well on both phones and desktops?', 'domain', 2,
        ['media quer', 'flex|grid', 'relative units|rem|%|viewport', 'mobile first', 'test|device']),
      q('bca-api-design', 'Design the API for a simple library management system.', 'problemSolving', 4,
        ['books|members|loans|resource', 'get|post|put|delete', 'validation|error', 'auth|role', 'status code']),
      q('bca-complexity', 'Explain time complexity to a non-technical person.', 'communication', 3,
        ['grows|input size', 'analogy|example', 'big o', 'faster|slower'])
    ]
  },
  {
    id: 'bsc-cs',
    name: 'BSc Computer Science',
    full: 'Bachelor of Science in Computer Science',
    group: 'Technology',
    roles: ['Software Engineer', 'Systems Programmer', 'Research Assistant'],
    focus: { domain: 82, problemSolving: 80, analytical: 78, communication: 60, teamwork: 58, leadership: 48, adaptability: 62, professionalism: 58 },
    questions: [
      q('cs-process-thread', 'What is the difference between a process and a thread?', 'domain', 2,
        ['memory|address space', 'shared|share memory', 'context switch', 'lightweight|overhead']),
      q('cs-deadlock', 'What causes a deadlock and how can you prevent it?', 'domain', 3,
        ['mutual exclusion', 'hold and wait', 'no preemption', 'circular wait', 'lock order|timeout|prevent']),
      q('cs-hash', 'How does a hash map work internally, and what happens on a collision?', 'domain', 3,
        ['hash function', 'bucket|array', 'collision', 'chaining|open addressing|probing', 'o(1)|resize|load factor']),
      q('cs-bigo', 'What is the time complexity of binary search and why?', 'analytical', 1,
        ['o(log n)|logarithmic', 'sorted', 'halves|divide', 'middle']),
      q('cs-recursion', 'Explain recursion and when it is a bad idea.', 'domain', 2,
        ['base case', 'calls itself', 'stack overflow|stack', 'iteration|memo|overhead']),
      q('cs-dp', 'Explain dynamic programming using an example problem.', 'analytical', 4,
        ['overlapping subproblems', 'optimal substructure', 'memo|tabulation', 'example|fibonacci|knapsack|coin']),
      q('cs-graph', 'How would you find the shortest route between two places on a map?', 'problemSolving', 3,
        ['graph|nodes|edges', 'dijkstra|bfs|a star', 'weights|distance', 'priority queue|heap']),
      q('cs-virtual-memory', 'What is virtual memory and why do operating systems use it?', 'domain', 3,
        ['paging|pages', 'disk|swap', 'isolation|protection', 'larger than physical|address space']),
      q('cs-compile', 'What happens between writing source code and the program running?', 'domain', 4,
        ['compile|compiler', 'lexical|parse|syntax tree', 'optimiz', 'link|machine code|bytecode', 'loader|runtime']),
      q('cs-design-cache', 'Design an LRU cache. What data structures would you use?', 'problemSolving', 5,
        ['hash map', 'doubly linked list', 'o(1)', 'evict|least recently', 'capacity'])
    ]
  },
  {
    id: 'btech-cse',
    name: 'BTech / BE (CSE)',
    full: 'Bachelor of Technology in Computer Science & Engineering',
    group: 'Technology',
    roles: ['Software Development Engineer', 'Backend Engineer', 'Full-stack Engineer', 'DevOps Engineer'],
    focus: { domain: 85, problemSolving: 82, analytical: 78, communication: 64, teamwork: 62, leadership: 55, adaptability: 64, professionalism: 60 },
    questions: [
      q('bt-system-url', 'Design a URL shortener. Focus on the data model and how it scales.', 'problemSolving', 4,
        ['hash|base62|id generation', 'database|key value', 'redirect|301|302', 'cache', 'scale|shard|replica']),
      q('bt-cap', 'Explain the CAP theorem with a practical example.', 'domain', 4,
        ['consistency', 'availability', 'partition tolerance', 'trade-off|choose', 'example']),
      q('bt-microservices', 'When would you NOT use microservices?', 'analytical', 4,
        ['small team|early stage', 'complexity|overhead', 'monolith', 'network|latency|deploy', 'data consistency']),
      q('bt-acid', 'What are ACID properties in databases?', 'domain', 2,
        ['atomicity', 'consistency', 'isolation', 'durability']),
      q('bt-tcp-udp', 'Compare TCP and UDP and name a use case for each.', 'domain', 2,
        ['reliable|ordered', 'connectionless|fast', 'handshake', 'video|gaming|dns|streaming']),
      q('bt-docker', 'What problem do containers solve compared with virtual machines?', 'domain', 3,
        ['isolation', 'lightweight|share kernel', 'consistent environment|works on my machine', 'image']),
      q('bt-solid', 'Pick two SOLID principles and show how they changed code you wrote.', 'domain', 3,
        ['single responsibility', 'open closed|liskov|interface segregation|dependency inversion', 'example|code', 'maintain|test']),
      q('bt-twosum', 'Find two numbers in an array that add up to a target. Walk me through your approach.', 'problemSolving', 2,
        ['brute force|nested loop|quadratic', 'hash map|set', 'o(n)|linear', 'edge case']),
      q('bt-debug-memory', 'A service\'s memory grows until it crashes every few days. How do you find the cause?', 'problemSolving', 5,
        ['memory leak', 'heap dump|profiler', 'reproduce|load test', 'references|cache|listener', 'monitor|metrics']),
      q('bt-ci', 'Describe a good CI/CD pipeline for a team of eight engineers.', 'domain', 3,
        ['version control|pull request', 'automated test', 'build|artifact', 'staging|environment', 'rollback|deploy']),
      q('bt-index-slow', 'A query that took 50 ms now takes 5 s. What do you check?', 'analytical', 4,
        ['explain|query plan', 'index', 'data growth|volume', 'lock|contention', 'statistics|cache'])
    ]
  },
  {
    id: 'mca',
    name: 'MCA',
    full: 'Master of Computer Applications',
    group: 'Technology',
    roles: ['Software Engineer', 'Technical Analyst', 'Full-stack Developer', 'Solutions Engineer'],
    focus: { domain: 84, problemSolving: 80, analytical: 78, communication: 68, teamwork: 64, leadership: 60, adaptability: 66, professionalism: 64 },
    questions: [
      q('mca-arch', 'Explain the MVC architecture and how it shows up in a framework you have used.', 'domain', 2,
        ['model', 'view', 'controller', 'separation of concerns', 'framework|angular|spring|django|express']),
      q('mca-auth', 'Compare session-based authentication with JWT.', 'domain', 3,
        ['server state|session store', 'stateless|token', 'expiry|refresh', 'revocation|logout', 'cookie|header']),
      q('mca-design-patterns', 'Which design patterns have you actually used, and why?', 'domain', 3,
        ['singleton|factory|observer|strategy|adapter', 'problem it solved', 'example|project', 'trade-off']),
      q('mca-nosql', 'When would you choose MongoDB over PostgreSQL?', 'analytical', 3,
        ['schema|flexible|document', 'relational|joins|transactions', 'scale|horizontal', 'use case|example']),
      q('mca-requirements', 'A client keeps changing requirements mid-sprint. How do you handle it?', 'professionalism', 3,
        ['understand|clarify', 'impact|estimate', 'backlog|prioritise|prioritize', 'communicate|agree', 'scope']),
      q('mca-project-deep', 'Pick your final-year project and explain the hardest technical decision in it.', 'communication', 3,
        ['project|problem', 'options|alternatives', 'decision|chose', 'trade-off|why', 'result|learned']),
      q('mca-cloud-cost', 'Your cloud bill doubled this month. How do you investigate?', 'analytical', 4,
        ['cost explorer|billing|breakdown', 'service|resource', 'unused|idle|over-provisioned', 'autoscal|reserved', 'alert|budget']),
      q('mca-api-version', 'How do you change a public API without breaking existing clients?', 'problemSolving', 4,
        ['version', 'backward compatible', 'deprecat', 'communicate|documentation', 'migration']),
      q('mca-concurrency', 'Two users book the last seat at the same time. How do you stop a double booking?', 'problemSolving', 5,
        ['race condition', 'transaction|lock', 'optimistic|version|pessimistic', 'unique constraint|atomic', 'retry|message'])
    ]
  },
  {
    id: 'bsc-ds',
    name: 'BSc Data Science',
    full: 'Bachelor of Science in Data Science',
    group: 'Technology',
    roles: ['Data Analyst', 'Junior Data Scientist', 'Business Intelligence Analyst'],
    focus: { domain: 80, problemSolving: 74, analytical: 85, communication: 66, teamwork: 60, leadership: 50, adaptability: 64, professionalism: 60 },
    questions: [
      q('ds-overfit', 'What is overfitting and how do you detect and reduce it?', 'domain', 2,
        ['train well|training data', 'generalise|generalize|unseen', 'validation|cross-validation|test set', 'regularization|dropout|simpler|more data']),
      q('ds-metrics', 'Your fraud model has 99% accuracy. Why might that be meaningless?', 'analytical', 3,
        ['imbalanced|imbalance', 'precision', 'recall', 'f1|auc|confusion matrix']),
      q('ds-missing', 'How do you handle missing values in a dataset?', 'domain', 2,
        ['why missing|pattern', 'drop|remove', 'impute|mean|median|mode', 'indicator|model', 'bias']),
      q('ds-pvalue', 'Explain a p-value to a product manager.', 'communication', 3,
        ['null hypothesis', 'probability|chance', 'significant|0.05', 'not proof|does not mean']),
      q('ds-abtest', 'Design an A/B test for a new checkout button.', 'analytical', 4,
        ['hypothesis', 'metric|conversion', 'random|split', 'sample size|duration', 'significance']),
      q('ds-sql-window', 'How would you find each customer\'s second most recent order in SQL?', 'domain', 4,
        ['window function|row_number|rank', 'partition by', 'order by', 'filter|where']),
      q('ds-bias-var', 'Explain the bias–variance trade-off.', 'domain', 3,
        ['bias|underfit', 'variance|overfit', 'trade-off|balance', 'complexity']),
      q('ds-dashboard', 'Sales dropped 15% last week. The CEO wants answers by noon. What do you do?', 'problemSolving', 4,
        ['data quality|check data', 'segment|region|product|channel', 'compare|trend|seasonal', 'hypothesis|cause', 'communicate|summary']),
      q('ds-features', 'What is feature engineering? Give an example that improved a model.', 'domain', 3,
        ['create|transform|features', 'domain knowledge', 'example', 'improved|accuracy|metric'])
    ]
  },
  {
    id: 'bcom',
    name: 'BCom',
    full: 'Bachelor of Commerce',
    group: 'Commerce',
    roles: ['Accounts Executive', 'Audit Assistant', 'Financial Analyst', 'Tax Associate'],
    focus: { domain: 78, analytical: 76, communication: 66, problemSolving: 66, professionalism: 72, teamwork: 60, leadership: 50, adaptability: 60 },
    questions: [
      q('bc-golden', 'Explain the golden rules of accounting.', 'domain', 1,
        ['personal account|debit the receiver', 'real account|debit what comes in', 'nominal account|expenses and losses', 'credit']),
      q('bc-statements', 'What are the three main financial statements and how are they linked?', 'domain', 2,
        ['balance sheet', 'income statement|profit and loss|p&l', 'cash flow', 'net income|retained earnings|link']),
      q('bc-depreciation', 'What is depreciation and compare straight-line with written-down value.', 'domain', 2,
        ['wear|reduction in value|allocate cost', 'straight line|equal', 'written down|reducing balance', 'useful life']),
      q('bc-gst', 'Explain input tax credit under GST with an example.', 'domain', 3,
        ['input tax|purchase', 'output tax|sales', 'set off|reduce liability', 'example|amount', 'cgst|sgst|igst']),
      q('bc-ratio', 'A company has a current ratio of 0.8. What does that tell you?', 'analytical', 3,
        ['current assets', 'current liabilities', 'liquidity|short-term', 'below 1|risk|working capital']),
      q('bc-recon', 'What is a bank reconciliation statement and why does it rarely match first time?', 'domain', 2,
        ['cash book|pass book|bank statement', 'cheque|uncleared|in transit', 'bank charges|interest', 'timing difference|error']),
      q('bc-audit', 'You find a ₹2 lakh expense with no supporting invoice during an audit. What next?', 'professionalism', 4,
        ['document|evidence', 'ask|inquire|management', 'materiality', 'report|flag|qualify', 'policy|control']),
      q('bc-cashflow-profit', 'Can a profitable company run out of cash? How?', 'analytical', 4,
        ['profit not cash|accrual', 'receivable|credit sales', 'inventory|working capital', 'debt|capex', 'example']),
      q('bc-excel', 'Which Excel functions do you rely on for accounting work?', 'domain', 2,
        ['vlookup|xlookup|index match', 'sumif|pivot', 'if|conditional', 'example|task']),
      q('bc-budget', 'Your department is 20% over budget mid-year. What would you recommend?', 'problemSolving', 4,
        ['variance analysis|cause', 'fixed|variable cost', 'cut|defer|negotiate', 'forecast|revise', 'communicate'])
    ]
  },
  {
    id: 'mcom',
    name: 'MCom',
    full: 'Master of Commerce',
    group: 'Commerce',
    roles: ['Financial Analyst', 'Senior Accountant', 'Credit Analyst', 'Lecturer (Commerce)'],
    focus: { domain: 82, analytical: 80, communication: 68, problemSolving: 70, professionalism: 72, teamwork: 60, leadership: 58, adaptability: 60 },
    questions: [
      q('mc-ind-as', 'What changed for Indian companies moving from old GAAP to Ind AS?', 'domain', 4,
        ['ifrs|converged', 'fair value', 'revenue recognition|ind as 115', 'leases|ind as 116', 'disclosure']),
      q('mc-wacc', 'Explain WACC and why it matters in capital budgeting.', 'domain', 3,
        ['cost of equity', 'cost of debt', 'weights|proportion', 'discount rate|npv', 'tax shield']),
      q('mc-npv-irr', 'When might NPV and IRR give you different answers?', 'analytical', 4,
        ['mutually exclusive', 'scale|size', 'timing of cash flows', 'multiple irr|reinvestment', 'prefer npv']),
      q('mc-credit', 'How would you assess whether to lend to a small manufacturing business?', 'analytical', 4,
        ['financial statements', 'debt service|interest coverage', 'collateral', 'industry|management|character', 'cash flow']),
      q('mc-derivatives', 'Explain how a company might use a forward contract to manage risk.', 'domain', 3,
        ['hedge', 'forward|agreed price', 'currency|commodity', 'future date', 'example']),
      q('mc-fraud', 'Which red flags in financial statements make you suspect manipulation?', 'analytical', 5,
        ['revenue growth|receivables', 'cash flow vs profit', 'related party', 'auditor|qualified', 'one-off|unusual']),
      q('mc-teach', 'Explain working capital management to a first-year student.', 'communication', 2,
        ['current assets', 'current liabilities', 'cash cycle', 'example|analogy'])
    ]
  },
  {
    id: 'bba',
    name: 'BBA',
    full: 'Bachelor of Business Administration',
    group: 'Management',
    roles: ['Business Development Executive', 'Marketing Associate', 'HR Associate', 'Operations Trainee'],
    focus: { communication: 78, leadership: 68, teamwork: 70, analytical: 66, problemSolving: 66, domain: 64, adaptability: 70, professionalism: 68 },
    questions: [
      q('bba-4p', 'Explain the 4Ps of marketing using a brand you like.', 'domain', 1,
        ['product', 'price', 'place|distribution', 'promotion', 'brand|example']),
      q('bba-swot', 'Do a quick SWOT analysis of a local café chain.', 'analytical', 2,
        ['strength', 'weakness', 'opportunit', 'threat', 'specific|example']),
      q('bba-sell', 'Sell me this pen.', 'communication', 2,
        ['question|need|ask', 'benefit|value', 'objection', 'close|ask for']),
      q('bba-motivation', 'How would you motivate a team doing repetitive work?', 'leadership', 3,
        ['recognition|appreciate', 'goal|purpose', 'growth|rotate|learning', 'feedback|listen', 'theory|maslow|herzberg']),
      q('bba-segment', 'What is market segmentation and how would you segment a fitness app?', 'domain', 3,
        ['demographic', 'psychographic|lifestyle', 'behavioural|behavioral|usage', 'geographic', 'target']),
      q('bba-launch', 'You have ₹5 lakh to launch a product in a new city. Plan the first 90 days.', 'problemSolving', 4,
        ['research|target customer', 'channel|digital|local', 'budget split|allocate', 'metric|kpi', 'iterate|review']),
      q('bba-hr', 'Attrition in a sales team is 40%. What would you look into?', 'analytical', 4,
        ['exit interview|data', 'pay|incentive', 'manager|culture', 'hiring|fit|onboarding', 'action|retention']),
      q('bba-supply', 'Explain the bullwhip effect in supply chains.', 'domain', 4,
        ['demand variation|amplif', 'upstream|supplier', 'forecast|order', 'inventory', 'information sharing|reduce']),
      q('bba-customer', 'An angry customer posts about your brand on social media. Respond.', 'professionalism', 3,
        ['acknowledge|apologise|apologize', 'quick|respond', 'move offline|private', 'resolve|fix', 'follow up'])
    ]
  },
  {
    id: 'mba',
    name: 'MBA',
    full: 'Master of Business Administration',
    group: 'Management',
    roles: ['Product Manager', 'Management Consultant', 'Brand Manager', 'Finance Manager', 'HR Business Partner'],
    focus: { leadership: 80, communication: 80, analytical: 78, problemSolving: 78, domain: 70, teamwork: 72, adaptability: 74, professionalism: 74 },
    questions: [
      q('mba-guesstimate', 'Estimate the number of cups of tea sold in Mumbai in a day.', 'analytical', 3,
        ['population', 'segment|assumption', 'per capita|cups per person', 'calculate|multiply', 'sanity check']),
      q('mba-case-profit', 'A pizza chain\'s profits fell 20% while revenue held steady. How do you diagnose it?', 'problemSolving', 4,
        ['profit equals revenue minus cost', 'fixed cost|variable cost', 'ingredient|rent|labour|labor|delivery', 'hypothesis|framework', 'recommend']),
      q('mba-porter', 'Use Porter\'s Five Forces to assess the food-delivery industry.', 'domain', 3,
        ['rivalry|competition', 'new entrants', 'substitutes', 'supplier power|restaurants', 'buyer power|customers']),
      q('mba-lead-change', 'How would you lead a team through a change most of them do not want?', 'leadership', 4,
        ['why|purpose|communicate', 'listen|concerns', 'involve|champions', 'quick wins', 'measure|follow up']),
      q('mba-prioritise', 'You have three product features and capacity for one. How do you choose?', 'analytical', 3,
        ['impact|value', 'effort|cost', 'customer|data|research', 'strategy|goals', 'rice|framework|trade-off']),
      q('mba-negotiate', 'Tell me about a negotiation where you did not get what you wanted. What happened?', 'communication', 4,
        ['context|situation', 'batna|alternative|position', 'interests|other side', 'outcome', 'learned'], 'behavioral'),
      q('mba-pricing', 'How would you price a new premium electric scooter for Indian cities?', 'problemSolving', 4,
        ['cost|cost-plus', 'competitor', 'value|willingness to pay', 'segment|target', 'subsidy|emi|financing']),
      q('mba-metric', 'Daily active users are up 10% but revenue is flat. What would you investigate?', 'analytical', 5,
        ['cohort|segment', 'conversion|monetisation|monetization', 'new vs returning', 'pricing|arpu', 'experiment|hypothesis']),
      q('mba-ethics', 'Your biggest client asks for a discount that will make the deal loss-making. What do you do?', 'professionalism', 4,
        ['understand|why', 'value|alternatives', 'long term|relationship', 'walk away|limit', 'stakeholder|approval'])
    ]
  },
  {
    id: 'ba',
    name: 'BA',
    full: 'Bachelor of Arts (Economics / Humanities)',
    group: 'Humanities',
    roles: ['Content Writer', 'Policy Research Assistant', 'Customer Success Associate', 'Civil Services Aspirant'],
    focus: { communication: 82, analytical: 72, domain: 66, problemSolving: 64, teamwork: 66, leadership: 56, adaptability: 70, professionalism: 66 },
    questions: [
      q('ba-inflation', 'Explain inflation and how a central bank tries to control it.', 'domain', 2,
        ['prices rise|purchasing power', 'demand|supply|cost push', 'interest rate|repo', 'money supply', 'trade-off|growth']),
      q('ba-argue', 'Pick a social issue you care about and argue both sides fairly.', 'communication', 3,
        ['issue|topic', 'one side|argument for', 'other side|argument against', 'evidence|data', 'balanced|conclusion']),
      q('ba-research', 'How would you research a question you know nothing about, in two days?', 'analytical', 3,
        ['primary|secondary source', 'credible|verify', 'organise|organize|notes', 'synthesise|synthesize|summary', 'cite']),
      q('ba-gdp', 'Why is GDP an incomplete measure of wellbeing?', 'analytical', 3,
        ['inequality|distribution', 'unpaid work|informal', 'environment', 'happiness|health|hdi', 'alternative']),
      q('ba-write', 'How do you adapt your writing for different audiences?', 'communication', 2,
        ['audience|reader', 'tone', 'simplify|jargon', 'structure|headings', 'example']),
      q('ba-policy', 'Evaluate a government scheme you have read about. Did it work?', 'analytical', 4,
        ['objective|aim', 'implementation', 'evidence|data|outcome', 'challenge|limitation', 'improve|recommend']),
      q('ba-customer', 'A customer is confused and frustrated with a product. Walk me through the call.', 'professionalism', 2,
        ['listen|empathise|empathize', 'clarify|question', 'explain simply|steps', 'confirm|resolved', 'follow up'])
    ]
  }
];

const PERSONAS = [
  {
    id: 'mentor',
    name: 'Meera',
    title: 'Supportive HR Partner',
    style: 'Warm, encouraging, gives you room to think. Probes gently.',
    tone: 'warm',
    pressure: 1,
    voice: { rate: 0.98, pitch: 1.05 },
    hue: 28
  },
  {
    id: 'tech-lead',
    name: 'Arjun',
    title: 'Technical Lead',
    style: 'Precise and curious. Asks "why" and "how would you measure that" a lot.',
    tone: 'direct',
    pressure: 2,
    voice: { rate: 1.04, pitch: 0.95 },
    hue: 205
  },
  {
    id: 'panel',
    name: 'Dr. Kapoor',
    title: 'Senior Panel Chair',
    style: 'Formal and thorough. Expects structured answers and evidence.',
    tone: 'formal',
    pressure: 3,
    voice: { rate: 0.94, pitch: 0.9 },
    hue: 260
  },
  {
    id: 'founder',
    name: 'Zoya',
    title: 'Startup Founder',
    style: 'Fast-paced, cares about impact and ownership. Will interrupt vague answers.',
    tone: 'energetic',
    pressure: 3,
    voice: { rate: 1.1, pitch: 1.1 },
    hue: 150
  },
  {
    id: 'skeptic',
    name: 'Mr. Rao',
    title: 'Skeptical Hiring Manager',
    style: 'Challenges claims and pushes back. Used automatically in Stress Mode.',
    tone: 'challenging',
    pressure: 5,
    voice: { rate: 1.06, pitch: 0.85 },
    hue: 0
  }
];

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', speech: 'en-IN', offline: true },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi-IN', offline: true },
  { code: 'es', name: 'Spanish', native: 'Español', speech: 'es-ES', offline: true },
  { code: 'fr', name: 'French', native: 'Français', speech: 'fr-FR', offline: true },
  { code: 'de', name: 'German', native: 'Deutsch', speech: 'de-DE', offline: true },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', speech: 'ta-IN', offline: false },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', speech: 'te-IN', offline: false },
  { code: 'mr', name: 'Marathi', native: 'मराठी', speech: 'mr-IN', offline: false },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', speech: 'bn-IN', offline: false },
  { code: 'ar', name: 'Arabic', native: 'العربية', speech: 'ar-SA', offline: false },
  { code: 'ja', name: 'Japanese', native: '日本語', speech: 'ja-JP', offline: false },
  { code: 'pt', name: 'Portuguese', native: 'Português', speech: 'pt-BR', offline: false }
];

function getStream(id) {
  return STREAMS.find((s) => s.id === id) || null;
}

function allQuestionsFor(streamId) {
  const stream = getStream(streamId);
  return [...(stream ? stream.questions : []), ...COMMON];
}

function findQuestion(id) {
  for (const s of STREAMS) {
    const found = s.questions.find((x) => x.id === id);
    if (found) return found;
  }
  return COMMON.find((x) => x.id === id) || null;
}

module.exports = { COMPETENCIES, COMMON, STREAMS, PERSONAS, LANGUAGES, getStream, allQuestionsFor, findQuestion };
