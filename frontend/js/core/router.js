import { loadAdminDashboard } from "../modules/adminDashboard.js";
import { loadVoterDashboard } from "../modules/voterDashboard.js";

const page = document.getElementById("page");
const pageTitle = document.getElementById("pageTitle");

function render() {
  const route = window.location.hash.replace("#", "") || "/admin";

  page.innerHTML = "";

  if (route === "/admin") {
    pageTitle.innerText = "Admin Dashboard";
    loadAdminDashboard(page);
  }

  else if (route === "/voter") {
    pageTitle.innerText = "Voter Dashboard";
    loadVoterDashboard(page);
  }

  else {
    page.innerHTML = "<h1>Page Not Found</h1>";
  }
}

window.addEventListener("hashchange", render);
window.addEventListener("load", render);