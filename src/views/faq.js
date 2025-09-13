const html = require('choo/html')

module.exports = function faqView(state, emit) {
  return html`
    <div class="app container faq">
      <table class="table">
        <tr><h1 class="title"><a href="/">bizcardz.ai</a></h1></tr>
        <br/>

        <tr><h2><i>What materials are used?</i></h2></tr>
        <tr><p>Your design is manufactured as a printed circuit board involving copper, tin, nickel, gold and silver.</p></tr>
        <br/>

        <tr><h2><i>Who manufactures these?</i></h2></tr>
        <tr><p>You will receive a ZIP archive which contains files that can be sent to <a href="https://www.elecrow.com/referral-program/OTM1MThqMnQ/">Elecrow</a>.</p></tr>
        <br/>

        <tr><h2><i>What is the cost?</i></h2></tr>
        <tr><p>This site is free. Elecrow charges about $1 per pcb in quantities of 50 and $0.80 in quantities of 100.</p></tr>
        <br/>

        <tr><h2><i>Show me pictures</i></h2></tr>
        <tr><p>
          <a target="_blank" rel="noopener noreferrer" href="/assets/img/faq-all.jpg">here</a>
          <a target="_blank" rel="noopener noreferrer" href="/assets/img/faq-black-silver.jpg">are</a>
          <a target="_blank" rel="noopener noreferrer" href="/assets/img/faq-black-gold.jpg">some</a>
          <a target="_blank" rel="noopener noreferrer" href="/assets/img/faq-white-silver.jpg">pic</a>
          <a target="_blank" rel="noopener noreferrer" href="/assets/img/faq-white-gold.jpg">tures</a>
        </p></tr>
        <br/>

        <tr><h2><i>Contact</i></h2></tr>
        <tr><p><i>Email: hello@bizcardz.ai</i></p></tr>
        <br/>
      </table>
    </div>
  `
}
