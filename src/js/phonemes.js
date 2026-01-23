class Phonemes {

    // Minimal English phoneme rules.
    // Important: patterns must match from the START of the remaining string.
    phonemeRules = [
        // digraphs (longer first)
        {pattern: /^sh/, phoneme: "ʃ"}, // "sh" -> /ʃ/
        {pattern: /^ch/, phoneme: "ʧ"}, // "ch" -> /ʧ/
        {pattern: /^th/, phoneme: "θ"}, // "th" -> /θ/
        {pattern: /^ea/, phoneme: "iː"}, // "ea" -> /iː/

        // Note: "oo" can be /uː/ or /ʊ/ depending on the word. We keep one mapping for determinism.
        {pattern: /^oo/, phoneme: "uː"},

        // single letters
        {pattern: /^a/, phoneme: "æ"},
        {pattern: /^e/, phoneme: "ɛ"},
        {pattern: /^i/, phoneme: "ɪ"},
        {pattern: /^o/, phoneme: "ɒ"},
        {pattern: /^u/, phoneme: "ʌ"},
        {pattern: /^p/, phoneme: "p"},
        {pattern: /^b/, phoneme: "b"},
        {pattern: /^t/, phoneme: "t"},
        {pattern: /^d/, phoneme: "d"},
        {pattern: /^k/, phoneme: "k"},
        {pattern: /^g/, phoneme: "g"},
        {pattern: /^l/, phoneme: "l"},
        {pattern: /^r/, phoneme: "r"},
        {pattern: /^m/, phoneme: "m"},
        {pattern: /^n/, phoneme: "n"},
        {pattern: /^s/, phoneme: "s"},
        {pattern: /^z/, phoneme: "z"},
        {pattern: /^f/, phoneme: "f"},
        {pattern: /^v/, phoneme: "v"},
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

    // Convert a single word to a space-separated phoneme string.
    // Example: "this" -> "θ ɪ s" (very simplified)
    convertWordToPhonemes(word) {
        const list = this.convertWordToPhonemeList(word);
        return list.join(" ");
    }

    // Same as convertWordToPhonemes, but returns an array for easier downstream processing.
    convertWordToPhonemeList(word) {
        if (typeof word !== "string") return [];

        const phonemes = [];
        let remaining = word.toLowerCase();

        while (remaining.length > 0) {
            let matched = false;

            for (const rule of this.phonemeRules) {
                const match = remaining.match(rule.pattern);
                if (match && match.index === 0) {
                    const consumed = match[0];
                    phonemes.push(rule.phoneme);
                    remaining = remaining.slice(consumed.length);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                // If no rule matched, consume one character to avoid infinite loops.
                phonemes.push(remaining[0]);
                remaining = remaining.slice(1);
            }
        }

        return phonemes;
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