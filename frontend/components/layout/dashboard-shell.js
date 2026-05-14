import { Sidebar } from "./sidebar.js";
import { Topbar } from "./topbar.js";

export function DashboardShell({
    page,
    title,
    content
}) {

    return `
        <div class="dashboard-container">

            ${Sidebar(page)}

            <main class="dashboard-main">

                ${Topbar(title)}

                <section class="dashboard-content">
                    ${content}
                </section>

            </main>

        </div>
    `;
}