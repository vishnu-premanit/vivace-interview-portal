'use strict';
/**
 * Offline phrasebook for the interviewer's voice. Gemini handles every language
 * when a key is present; without one we can still run fully-localised HR rounds
 * in these five languages. Technical questions stay in English offline (noted in UI).
 */

const PHRASES = {
  en: {
    greeting: (name, persona) => `Hi ${name}, I'm ${persona}. Let's begin — take a breath, there's no rush.`,
    followVague: 'Could you make that more concrete? A specific example would help.',
    followResult: 'And what was the measurable result of that?',
    followWhy: 'Why did you choose that approach over the alternatives?',
    followClaim: (claim) => `You mentioned ${claim}. Can you walk me through exactly what you did there?`,
    followShort: 'That was quite brief. Can you go one level deeper?',
    stressInterrupt: 'Let me stop you there — get to the point. What exactly did YOU do?',
    stressDoubt: "I'm not convinced. Why should I believe that?",
    closing: 'Thank you, that wraps up our interview. Your report is being prepared.'
  },
  hi: {
    greeting: (name, persona) => `नमस्ते ${name}, मैं ${persona} हूँ। चलिए शुरू करते हैं — आराम से, कोई जल्दी नहीं है।`,
    followVague: 'क्या आप इसे थोड़ा और स्पष्ट कर सकते हैं? एक ठोस उदाहरण दीजिए।',
    followResult: 'और उसका मापने योग्य परिणाम क्या था?',
    followWhy: 'आपने दूसरे विकल्पों के बजाय यही तरीका क्यों चुना?',
    followClaim: (claim) => `आपने ${claim} का ज़िक्र किया। बताइए आपने उसमें असल में क्या किया?`,
    followShort: 'जवाब काफ़ी छोटा था। क्या आप थोड़ा और विस्तार से बता सकते हैं?',
    stressInterrupt: 'यहीं रुकिए — सीधे मुद्दे पर आइए। आपने ख़ुद क्या किया?',
    stressDoubt: 'मुझे यक़ीन नहीं हो रहा। मैं इस पर भरोसा क्यों करूँ?',
    closing: 'धन्यवाद, इंटरव्यू यहीं समाप्त होता है। आपकी रिपोर्ट तैयार हो रही है।'
  },
  es: {
    greeting: (name, persona) => `Hola ${name}, soy ${persona}. Empecemos — respira, no hay prisa.`,
    followVague: '¿Podrías concretarlo un poco más? Un ejemplo específico ayudaría.',
    followResult: '¿Y cuál fue el resultado medible?',
    followWhy: '¿Por qué elegiste ese enfoque frente a las alternativas?',
    followClaim: (claim) => `Mencionaste ${claim}. ¿Qué hiciste exactamente ahí?`,
    followShort: 'Fue bastante breve. ¿Puedes profundizar un poco más?',
    stressInterrupt: 'Déjame interrumpirte: ve al grano. ¿Qué hiciste TÚ exactamente?',
    stressDoubt: 'No me convence. ¿Por qué debería creerlo?',
    closing: 'Gracias, aquí termina la entrevista. Estamos preparando tu informe.'
  },
  fr: {
    greeting: (name, persona) => `Bonjour ${name}, je suis ${persona}. Commençons — prenez votre temps.`,
    followVague: 'Pouvez-vous être plus concret ? Un exemple précis aiderait.',
    followResult: 'Et quel a été le résultat mesurable ?',
    followWhy: 'Pourquoi avoir choisi cette approche plutôt qu’une autre ?',
    followClaim: (claim) => `Vous avez mentionné ${claim}. Qu’avez-vous fait exactement ?`,
    followShort: 'C’était assez bref. Pouvez-vous approfondir ?',
    stressInterrupt: 'Je vous arrête — allez à l’essentiel. Qu’avez-vous fait, VOUS ?',
    stressDoubt: 'Je ne suis pas convaincu. Pourquoi devrais-je vous croire ?',
    closing: 'Merci, l’entretien est terminé. Votre rapport est en préparation.'
  },
  de: {
    greeting: (name, persona) => `Hallo ${name}, ich bin ${persona}. Fangen wir an — ganz in Ruhe.`,
    followVague: 'Können Sie das konkreter machen? Ein Beispiel würde helfen.',
    followResult: 'Und was war das messbare Ergebnis?',
    followWhy: 'Warum haben Sie sich für diesen Ansatz entschieden?',
    followClaim: (claim) => `Sie haben ${claim} erwähnt. Was genau haben Sie dort gemacht?`,
    followShort: 'Das war recht knapp. Können Sie etwas tiefer gehen?',
    stressInterrupt: 'Ich unterbreche kurz — kommen Sie zum Punkt. Was haben SIE gemacht?',
    stressDoubt: 'Das überzeugt mich nicht. Warum sollte ich das glauben?',
    closing: 'Danke, damit ist das Interview beendet. Ihr Bericht wird erstellt.'
  }
};

// Translations of the common HR questions (ids from streams.COMMON).
const QUESTIONS = {
  hi: {
    'hr-intro': 'अपनी पृष्ठभूमि के बारे में बताइए और आप इस भूमिका में क्यों रुचि रखते हैं?',
    'hr-strength': 'आपके पिछले टीम लीड या प्रोफ़ेसर आपकी सबसे बड़ी ताक़त क्या बताएँगे? एक उदाहरण दीजिए।',
    'hr-weakness': 'अपनी किसी कमज़ोरी के बारे में बताइए जिस पर आप काम कर रहे हैं।',
    'hr-conflict': 'एक ऐसा समय बताइए जब आप किसी साथी से असहमत थे। आपने उसे कैसे संभाला?',
    'hr-failure': 'कुछ ऐसा बताइए जो योजना के अनुसार नहीं हुआ और आपने उसके बाद क्या बदला।',
    'hr-deadline': 'ऐसी स्थिति बताइए जब आपको बहुत कम समय में काम पूरा करना पड़ा।',
    'hr-lead': 'एक उदाहरण दीजिए जब आपने बिना कहे किसी काम की ज़िम्मेदारी ली।',
    'hr-why-us': 'समान डिग्री वाले दूसरे उम्मीदवारों के बजाय हम आपको क्यों चुनें?',
    'hr-pressure': 'जब सब कुछ ज़रूरी लगे, तब आप कैसे तय करते हैं कि पहले क्या करना है?',
    'hr-feedback': 'आपको मिली सबसे कठिन प्रतिक्रिया (फ़ीडबैक) के बारे में बताइए।',
    'hr-5years': 'पाँच साल बाद आप अपने करियर को कहाँ देखते हैं?',
    'hr-ethics': 'आपको लगता है कि एक सहकर्मी बढ़ा-चढ़ाकर आँकड़े दिखा रहा है। आप क्या करेंगे?',
    'hr-team-lazy': 'आपके ग्रुप प्रोजेक्ट में एक व्यक्ति योगदान नहीं दे रहा। आप क्या करेंगे?',
    'hr-learn-fast': 'एक समय बताइए जब आपको कुछ नया बहुत जल्दी सीखना पड़ा।',
    'hr-data-decision': 'ऐसा निर्णय बताइए जो आपने अंदाज़े के बजाय डेटा के आधार पर लिया।'
  },
  es: {
    'hr-intro': 'Cuéntame tu trayectoria y qué te trae a este puesto.',
    'hr-strength': '¿Qué diría tu último jefe o profesor que es tu mayor fortaleza? Da un ejemplo.',
    'hr-weakness': 'Háblame de una debilidad en la que estés trabajando activamente.',
    'hr-conflict': 'Describe una ocasión en la que no estuviste de acuerdo con un compañero. ¿Cómo lo manejaste?',
    'hr-failure': 'Cuéntame algo que no salió según lo previsto y qué cambiaste después.',
    'hr-deadline': 'Describe una situación en la que tuviste que entregar con un plazo muy ajustado.',
    'hr-lead': 'Dame un ejemplo de algo de lo que te hiciste cargo sin que nadie te lo pidiera.',
    'hr-why-us': '¿Por qué deberíamos elegirte frente a otros candidatos con un título similar?',
    'hr-pressure': '¿Cómo decides en qué trabajar cuando todo parece urgente?',
    'hr-feedback': 'Háblame de la crítica más difícil que hayas recibido.',
    'hr-5years': '¿Dónde ves tu carrera dentro de cinco años, siendo realista?',
    'hr-ethics': 'Notas que un compañero reporta cifras que parecen infladas. ¿Qué haces?',
    'hr-team-lazy': 'Una persona de tu proyecto en grupo no está aportando. ¿Qué harías?',
    'hr-learn-fast': 'Cuéntame una vez en la que tuviste que aprender algo nuevo muy rápido.',
    'hr-data-decision': 'Describe una decisión que tomaste usando datos en lugar de intuición.'
  },
  fr: {
    'hr-intro': 'Présentez votre parcours et ce qui vous amène vers ce poste.',
    'hr-strength': 'Selon votre dernier responsable ou professeur, quelle est votre plus grande force ? Donnez un exemple.',
    'hr-weakness': 'Parlez-moi d’un point faible sur lequel vous travaillez activement.',
    'hr-conflict': 'Décrivez une fois où vous n’étiez pas d’accord avec un coéquipier. Comment l’avez-vous géré ?',
    'hr-failure': 'Parlez-moi d’un projet qui ne s’est pas passé comme prévu et de ce que vous avez changé ensuite.',
    'hr-deadline': 'Décrivez une situation où vous avez dû livrer avec un délai très serré.',
    'hr-lead': 'Donnez un exemple où vous avez pris une initiative sans qu’on vous le demande.',
    'hr-why-us': 'Pourquoi devrions-nous vous choisir plutôt qu’un autre candidat au diplôme similaire ?',
    'hr-pressure': 'Comment décidez-vous de vos priorités quand tout semble urgent ?',
    'hr-feedback': 'Parlez-moi du retour le plus difficile que vous ayez reçu.',
    'hr-5years': 'Où voyez-vous votre carrière dans cinq ans, de façon réaliste ?',
    'hr-ethics': 'Vous remarquez qu’un collègue présente des chiffres gonflés. Que faites-vous ?',
    'hr-team-lazy': 'Une personne de votre projet de groupe ne contribue pas. Que faites-vous ?',
    'hr-learn-fast': 'Racontez une fois où vous avez dû apprendre quelque chose très rapidement.',
    'hr-data-decision': 'Décrivez une décision prise à partir de données plutôt que d’intuition.'
  },
  de: {
    'hr-intro': 'Erzählen Sie mir von Ihrem Werdegang und was Sie zu dieser Stelle führt.',
    'hr-strength': 'Was würde Ihr letzter Teamleiter oder Professor als Ihre größte Stärke nennen? Geben Sie ein Beispiel.',
    'hr-weakness': 'Erzählen Sie mir von einer Schwäche, an der Sie aktiv arbeiten.',
    'hr-conflict': 'Beschreiben Sie eine Situation, in der Sie mit einem Teammitglied uneinig waren. Wie sind Sie damit umgegangen?',
    'hr-failure': 'Erzählen Sie von etwas, das nicht nach Plan lief, und was Sie danach geändert haben.',
    'hr-deadline': 'Beschreiben Sie eine Situation mit einer sehr knappen Deadline.',
    'hr-lead': 'Nennen Sie ein Beispiel, bei dem Sie ungefragt Verantwortung übernommen haben.',
    'hr-why-us': 'Warum sollten wir Sie anderen Kandidaten mit ähnlichem Abschluss vorziehen?',
    'hr-pressure': 'Wie entscheiden Sie, woran Sie arbeiten, wenn alles dringend erscheint?',
    'hr-feedback': 'Erzählen Sie von dem schwierigsten Feedback, das Sie je bekommen haben.',
    'hr-5years': 'Wo sehen Sie Ihre Karriere realistisch in fünf Jahren?',
    'hr-ethics': 'Sie bemerken, dass ein Kollege geschönte Zahlen meldet. Was tun Sie?',
    'hr-team-lazy': 'Eine Person in Ihrem Gruppenprojekt trägt nichts bei. Was tun Sie?',
    'hr-learn-fast': 'Erzählen Sie von einer Situation, in der Sie etwas sehr schnell lernen mussten.',
    'hr-data-decision': 'Beschreiben Sie eine Entscheidung, die Sie auf Basis von Daten statt Bauchgefühl getroffen haben.'
  }
};

function phrases(lang) {
  return PHRASES[lang] || PHRASES.en;
}

function translateQuestion(id, lang, fallbackText) {
  if (lang === 'en') return fallbackText;
  return (QUESTIONS[lang] && QUESTIONS[lang][id]) || fallbackText;
}

function hasOfflineSupport(lang) {
  return Boolean(PHRASES[lang]);
}

module.exports = { phrases, translateQuestion, hasOfflineSupport, PHRASES, QUESTIONS };
