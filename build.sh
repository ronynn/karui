esbuild src/*.js src/*.css   --minify   --outbase=src   --outdir=app/src/main/assets   --log-level=info
cp src/index.html app/src/main/assets

: << 'COMMENT'

    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.error('SW registration failed:', err));
        });
      }
    </script>
    
COMMENT