import MatijaJS from "../src/index";

class TestComponent extends FoundationComponent {
  content = `
    <div>
      lolcina
    </div>
  `;
}

MatijaJS.mount(TestComponent, document.getElementById("app"));
