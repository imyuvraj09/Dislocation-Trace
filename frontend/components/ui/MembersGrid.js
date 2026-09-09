import MemberCard from "./MemberCard";

export default function MembersGrid({ members = [] }) {
  if (!Array.isArray(members) || members.length === 0) {
    return <p className="text-sm text-muted">No contributors available.</p>;
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {members.map((m) => (
        <li key={m.id}>
          <MemberCard member={m} />
        </li>
      ))}
    </ul>
  );
}
