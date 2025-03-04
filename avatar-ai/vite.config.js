import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            util: "util/",
        },
    },
    define: {
        "process.env": { NODE_ENV: "development" }, // util expects a process.env
    },
});
