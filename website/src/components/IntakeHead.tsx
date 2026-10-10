// Just the welcome and the school's own mark.
//
// Nothing about arranging a visit: the family filling this in is standing in
// the building. They are not being persuaded to come and nobody is going to
// ring them to book what they are already doing.
export default function IntakeHead() {
  return (
    <div className="tf-head">
      <img
        className="tf-logo"
        src="https://saqefzgnvznuurupqpsw.supabase.co/storage/v1/object/public/site/brand/eurokids-logo.png"
        alt="EuroKids Pre-School"
      />
      <h1 className="tf-title">Welcome to EuroKids JMD Enclave</h1>
    </div>
  );
}
