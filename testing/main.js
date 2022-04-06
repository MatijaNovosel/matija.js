import MatijaJS from "../dist/matija-js.js";

class TestComponent {
  content = `
    <div>
      LOL
    </div>
  `;
}

MatijaJS.mount(TestComponent, document.getElementById("app"));
