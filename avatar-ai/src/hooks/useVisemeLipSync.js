import { useState, useCallback } from 'react';

const VALID_VISEMES = ['CH', 'DD', 'E', 'FF', 'I', 'O', 'PP', 'RR', 'SS', 'TH', 'U', 'aa', 'kk', 'nn'];

export const useVisemeLipSync = () => {
    const [currentViseme, setCurrentViseme] = useState('aa');

    const setViseme = useCallback((viseme) => {
        if (VALID_VISEMES.includes(viseme)) {
            setCurrentViseme(viseme);
        } else {
            console.log('aa')
            setCurrentViseme('aa');
        }
    }, []);

    return {
        currentViseme,
        setViseme
    };
};
