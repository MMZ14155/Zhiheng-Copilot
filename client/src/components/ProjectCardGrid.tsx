import type { ProjectListItem } from '../api';
import ProjectCard from './ProjectCard';

interface ProjectCardGridProps {
  projects: ProjectListItem[];
}

export default function ProjectCardGrid({ projects }: ProjectCardGridProps) {
  return (
    <div className="project-card-grid">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}
