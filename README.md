# grupo-plastrack-bi-uc

## PlasTrack

Prototipo académico estático para explorar pasadas Sentinel-2 **simuladas** sobre las islas Galápagos. El índice de acumulación que se muestra es únicamente ilustrativo: no representa una detección real de plástico ni debe utilizarse para tomar decisiones ambientales.

### Probar en Codespaces o VS Code

1. Abre la carpeta del repositorio en Codespaces o en VS Code.
2. Desde la terminal integrada, inicia un servidor estático en la raíz:

	```bash
	python3 -m http.server 8000
	```

3. Abre `http://localhost:8000` en el navegador. En Codespaces, acepta el aviso para abrir el puerto 8000; en VS Code puedes abrir esa URL en tu navegador.
4. Se requiere conexión a Internet para cargar Leaflet, Chart.js, la capa cartográfica de OpenStreetMap y el plugin de mapa de calor desde sus CDN o servidores.

También puedes usar la extensión Live Server de VS Code y abrir `index.html`. No se necesita Node.js, instalación de paquetes ni compilación.

### Publicar en GitHub Pages

1. Confirma los archivos en la rama `main` y súbelos al repositorio.
2. En GitHub, abre **Settings → Pages**.
3. En **Build and deployment**, selecciona **Deploy from a branch**.
4. Elige la rama `main` y la carpeta `/(root)`, y pulsa **Save**.
5. Espera a que termine el despliegue y abre la URL que GitHub Pages muestra en esa sección.

El sitio usa rutas relativas para los archivos locales, por lo que funciona tanto desde la raíz de Pages como al previsualizarlo localmente.