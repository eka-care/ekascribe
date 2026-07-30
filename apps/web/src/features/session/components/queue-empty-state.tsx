import { ThumbsUp, UserSearch } from 'lucide-react';

interface QueueEmptyStateProps {
  variant: 'no_doctor_selected' | 'no_patients';
}

const COPY = {
  no_doctor_selected: {
    title: 'Select a clinic and doctor',
    body: 'Choose a clinic and doctor from the sidebar to view their queue for today.',
    Icon: UserSearch,
  },
  no_patients: {
    title: "All patients in queue have been attended",
    body: 'There are no more patients waiting in your queue. You can start a new session anytime from the Sessions tab.',
    Icon: ThumbsUp,
  },
};

const QueueEmptyState = ({ variant }: QueueEmptyStateProps) => {
  const { title, body, Icon } = COPY[variant];

  return (
    <div className="w-full p-4 flex flex-col flex-1 h-full">
      <div className="flex flex-col flex-1 min-h-0 bg-white border border-[#D1D1D1] rounded-xl justify-center items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-green-10 flex items-center justify-center shadow-sm">
          <Icon className="w-10 h-10 text-white" strokeWidth={2} />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <h3 className="text-2xl font-semibold leading-8 text-[#1A1A1A] max-w-[330px]">
            {title}
          </h3>
          <p className="text-sm text-[#595959] max-w-[320px]">{body}</p>
        </div>
      </div>
    </div>
  );
};

export default QueueEmptyState;
