class TestComponent extends NazarComponent {
  data() {
    return {
      stateVar: "test"
    };
  }
  content = `
    <div>
      {{ stateVar }}
    </div>
  `;
}

Nazar.mount(TestComponent, document.getElementById("app"));
