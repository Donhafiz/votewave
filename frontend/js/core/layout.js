async function loadComponent(id, path){
  const response = await fetch(path);
  const html = await response.text();

  document.getElementById(id).innerHTML = html;
}

window.addEventListener('DOMContentLoaded', async () => {

  if(document.getElementById('sidebar-container')){
    await loadComponent(
      'sidebar-container',
      '/components/navigation/sidebar.html'
    );
  }

  if(document.getElementById('topbar-container')){
    await loadComponent(
      'topbar-container',
      '/components/navigation/topbar.html'
    );
  }

});