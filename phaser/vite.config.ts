import { defineConfig } from 'vite';
export default defineConfig({
 base: './',
 build: {outDir:'dist',assetsDir:'bundles',emptyOutDir:true},
 server: {host:'0.0.0.0',port:5173}
});
