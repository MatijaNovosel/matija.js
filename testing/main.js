import MatijaJS from "../dist/matija-js.js";

class TestComponent {
  content = `
    <div>
      lolcina
    </div>
  `;
}

MatijaJS.mount(TestComponent, document.getElementById("app"));
