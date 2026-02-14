'use client';

import clsx from 'clsx';
import { ConditionGrade, CONDITION_GRADES } from '../types';

interface ConditionGradeBadgeProps {
  grade: ConditionGrade;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  variant?: 'circle' | 'pill';
}

export function ConditionGradeBadge({
  grade,
  size = 'md',
  showLabel = false,
  variant = 'circle',
}: ConditionGradeBadgeProps) {
  const gradeInfo = CONDITION_GRADES[grade];

  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-6 h-6 text-xs',
    md: 'w-7 h-7 text-sm',
    lg: 'w-9 h-9 text-base',
  };

  const pillSizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  if (variant === 'pill') {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 font-semibold rounded-full',
          pillSizeClasses[size]
        )}
        style={{
          backgroundColor: `${gradeInfo.color}15`,
          color: gradeInfo.color,
        }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: gradeInfo.color }}
        />
        Grade {gradeInfo.value}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={clsx(
          'rounded-full flex items-center justify-center font-semibold text-white shadow-sm',
          sizeClasses[size]
        )}
        style={{ backgroundColor: gradeInfo.color }}
        title={`${gradeInfo.label} - ${gradeInfo.description}`}
      >
        {gradeInfo.value}
      </div>
      {showLabel && (
        <div>
          <div className="text-sm font-medium text-gray-900">{gradeInfo.label}</div>
          <div className="text-xs text-gray-500">{gradeInfo.description}</div>
        </div>
      )}
    </div>
  );
}

interface ConditionGradeSelectorProps {
  value: ConditionGrade | null;
  onChange: (grade: ConditionGrade) => void;
  disabled?: boolean;
}

export function ConditionGradeSelector({
  value,
  onChange,
  disabled = false,
}: ConditionGradeSelectorProps) {
  const grades: ConditionGrade[] = ['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5'];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {grades.map((grade) => {
          const gradeInfo = CONDITION_GRADES[grade];
          const isSelected = value === grade;

          return (
            <button
              key={grade}
              type="button"
              disabled={disabled}
              onClick={() => onChange(grade)}
              className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center font-semibold text-base transition-all duration-150',
                isSelected
                  ? 'ring-2 ring-offset-2 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              style={{
                backgroundColor: isSelected ? gradeInfo.color : undefined,
                ringColor: isSelected ? gradeInfo.color : undefined,
              }}
            >
              {gradeInfo.value}
            </button>
          );
        })}
      </div>

      {value && (
        <div
          className="p-3 rounded-lg border-l-3"
          style={{
            backgroundColor: `${CONDITION_GRADES[value].color}08`,
            borderLeftColor: CONDITION_GRADES[value].color,
            borderLeftWidth: '3px',
          }}
        >
          <div className="font-medium text-gray-900">{CONDITION_GRADES[value].label}</div>
          <div className="text-sm text-gray-600">{CONDITION_GRADES[value].description}</div>
        </div>
      )}
    </div>
  );
}
