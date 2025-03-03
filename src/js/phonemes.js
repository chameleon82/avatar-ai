class Phonemes {

    // include only English Phonemes
    phonemeRules = [
        {pattern: /^sh/, phoneme: "ʃ"}, // "sh" -> /ʃ/
        {pattern: /^ch/, phoneme: "ʧ"}, // "ch" -> /ʧ/
        {pattern: /^th/, phoneme: "θ"}, // "th" -> /θ/
        {pattern: /^ea/, phoneme: "iː"}, // "ea" -> /iː/
        {pattern: /^oo/, phoneme: "uː"}, // "oo" -> /uː/
        {pattern: /^oo/, phoneme: "ʊ"}, // "oo" -> /ʊ/ for "book"
        {pattern: /a/, phoneme: "æ"},   // "a" -> /æ/
        {pattern: /e/, phoneme: "ɛ"},   // "e" -> /ɛ/
        {pattern: /i/, phoneme: "ɪ"},   // "i" -> /ɪ/
        {pattern: /o/, phoneme: "ɒ"},   // "o" -> /ɒ/
        {pattern: /u/, phoneme: "ʌ"},   // "u" -> /ʌ/
        {pattern: /p/, phoneme: "p"},   // "p" -> /p/
        {pattern: /b/, phoneme: "b"},   // "b" -> /b/
        {pattern: /t/, phoneme: "t"},   // "t" -> /t/
        {pattern: /d/, phoneme: "d"},   // "d" -> /d/
        {pattern: /k/, phoneme: "k"},   // "k" -> /k/
        {pattern: /g/, phoneme: "g"},   // "g" -> /g/
        {pattern: /l/, phoneme: "l"},   // "l" -> /l/
        {pattern: /r/, phoneme: "r"},   // "r" -> /r/
        {pattern: /m/, phoneme: "m"},   // "m" -> /m/
        {pattern: /n/, phoneme: "n"},   // "n" -> /n/
        {pattern: /s/, phoneme: "s"},   // "s" -> /s/
        {pattern: /z/, phoneme: "z"},   // "z" -> /z/
        {pattern: /f/, phoneme: "f"},   // "f" -> /f/
        {pattern: /v/, phoneme: "v"},   // "v" -> /v/
    ];

    visemeMapping = {
        "ʃ": "CH",
        "ʧ": "CH",
        "θ": "TH",
        "iː": "I",
        "uː": "U",
        "ʊ": "U",
        "æ": "aa",
        "ɛ": "E",
        "ɪ": "I",
        "ɒ": "O",
        "ʌ": "U",
        "p": "PP",
        "b": "PP",
        "t": "DD",
        "d": "DD",
        "k": "kk",
        "g": "kk",
        "l": "RR",
        "r": "RR",
        "m": "nn",
        "n": "nn",
        "s": "SS",
        "z": "SS",
        "f": "FF",
        "v": "FF"
    };

    // Simple converter to convert words to phonemes
    // result is a list of phonemes
    convertWordToPhonemes(word) {
        let phonemes = [];
        word = word.toLowerCase();

        let remainingWord = word;
        while (remainingWord.length > 0) {
            let matched = false;
            for (let rule of this.phonemeRules) {
                if (remainingWord.startsWith(rule.pattern.source)) {
                    phonemes.push(rule.phoneme);
                    remainingWord = remainingWord.slice(rule.pattern.source.length);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                phonemes.push(remainingWord[0]);  // Add the letter as is if no rule matches
                remainingWord = remainingWord.slice(1);
            }
        }

        return phonemes.join(" ");
    }

    // Convert phonemes into visemes
    // return list of visemes
    mapPhonemesToVisemes(phonemes) {
        // Ensure phonemes is an array, if it's not, turn it into one
        if (!Array.isArray(phonemes)) {
            phonemes = [phonemes];
        }

        return phonemes.map(phoneme => this.visemeMapping[phoneme] || "Unknown Viseme " + phoneme);
    }
}